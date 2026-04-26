use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    fs,
    io::{BufRead, BufReader, Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::Emitter;

#[derive(Default)]
struct AppState {
    inner: Arc<Mutex<DesktopState>>,
}

#[derive(Default)]
struct DesktopState {
    workspace_id: Option<String>,
    root: Option<PathBuf>,
    agent_server_port: Option<u16>,
    agent_server_child: Option<Child>,
    watcher: Option<RecommendedWatcher>,
    documents: HashMap<String, DocumentRecord>,
    self_write_shas: HashMap<String, String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DocumentRecord {
    id: String,
    path: String,
    body: String,
    body_sha256: String,
    rev: u32,
    last_editor: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenWorkspaceResponse {
    workspace_id: String,
    root: String,
    agent_server_port: u16,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ReadDocResponse {
    body: String,
    rev: u32,
    body_sha256: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ApplyPatchResponse {
    status: String,
    document: Option<DocumentRecord>,
    file_path: Option<String>,
    patch_id: Option<String>,
    doc_id: Option<String>,
    conflict: Option<WorkspaceConflict>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceConflict {
    doc_id: String,
    path: String,
    reason: String,
    db_rev: u32,
    db_body_sha256: String,
    fs_body_sha256: Option<String>,
}

#[derive(Serialize, Clone)]
struct DocChangedPayload {
    doc_id: String,
    rev: u32,
    source: String,
}

#[tauri::command]
async fn open_workspace(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
) -> Result<OpenWorkspaceResponse, String> {
    let root = PathBuf::from(path).canonicalize().or_else(|_| {
        fs::create_dir_all(&path).map_err(|err| err.to_string())?;
        PathBuf::from(&path).canonicalize()
    }).map_err(|err| err.to_string())?;
    fs::create_dir_all(root.join(".weki")).map_err(|err| err.to_string())?;

    let workspace_id = make_uuid_like();
    let agent_server_port = reserve_port()?;
    let child = spawn_agent_server(agent_server_port)?;
    let documents = load_markdown_documents(&root)?;

    let mut guard = state.inner.lock().map_err(|_| "state lock poisoned".to_string())?;
    let _ = guard.watcher.take();
    if let Some(mut existing) = guard.agent_server_child.take() {
        let _ = existing.kill();
    }
    guard.workspace_id = Some(workspace_id.clone());
    guard.root = Some(root.clone());
    guard.agent_server_port = Some(agent_server_port);
    guard.agent_server_child = Some(child);
    guard.documents = documents;
    guard.self_write_shas.clear();
    drop(guard);

    let watcher = start_workspace_watcher(root.clone(), Arc::clone(&state.inner), app.clone())?;
    let mut guard = state.inner.lock().map_err(|_| "state lock poisoned".to_string())?;
    guard.watcher = Some(watcher);
    drop(guard);

    let _ = app.emit(
        "agent_run_progress",
        serde_json::json!({ "phase": "ready", "message": "agent.server.ready" }),
    );

    Ok(OpenWorkspaceResponse {
        workspace_id,
        root: root.to_string_lossy().to_string(),
        agent_server_port,
    })
}

#[tauri::command]
async fn list_documents(state: tauri::State<'_, AppState>) -> Result<Vec<DocumentRecord>, String> {
    let guard = state.inner.lock().map_err(|_| "state lock poisoned".to_string())?;
    let mut documents = guard.documents.values().cloned().collect::<Vec<_>>();
    documents.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(documents)
}

#[tauri::command]
async fn read_doc(state: tauri::State<'_, AppState>, doc_id: String) -> Result<ReadDocResponse, String> {
    let guard = state.inner.lock().map_err(|_| "state lock poisoned".to_string())?;
    let document = guard
        .documents
        .get(&doc_id)
        .ok_or_else(|| format!("document not found: {doc_id}"))?;
    Ok(ReadDocResponse {
        body: document.body.clone(),
        rev: document.rev,
        body_sha256: document.body_sha256.clone(),
    })
}

#[tauri::command]
async fn create_doc(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    path: String,
    body: Option<String>,
) -> Result<DocumentRecord, String> {
    let body = body.unwrap_or_default();
    let doc_path = normalize_doc_path(&path)?;
    let mut guard = state.inner.lock().map_err(|_| "state lock poisoned".to_string())?;
    let root = guard.root.clone().ok_or_else(|| "workspace is not open".to_string())?;

    if let Some(existing) = guard.documents.values().find(|doc| doc.path == doc_path) {
        return Ok(existing.clone());
    }

    let document = DocumentRecord {
        id: make_uuid_like(),
        path: doc_path,
        body,
        body_sha256: String::new(),
        rev: 1,
        last_editor: "human".to_string(),
    };
    let document = DocumentRecord {
        body_sha256: sha256_hex(document.body.as_bytes()),
        ..document
    };
    guard.self_write_shas.insert(document.path.clone(), document.body_sha256.clone());
    write_doc_file_atomically(&root, &document.path, &document.body, &document.id)?;
    guard.documents.insert(document.id.clone(), document.clone());
    drop(guard);

    let _ = app.emit(
        "doc_changed",
        DocChangedPayload {
            doc_id: document.id.clone(),
            rev: document.rev,
            source: "human".to_string(),
        },
    );
    Ok(document)
}

#[tauri::command]
async fn apply_patch(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    run_id: String,
    decision: String,
    patch: Option<Value>,
    expected_body: Option<String>,
) -> Result<ApplyPatchResponse, String> {
    if decision == "reject" {
        return Ok(ApplyPatchResponse {
            status: "rejected".to_string(),
            document: None,
            file_path: None,
            patch_id: Some(run_id),
            doc_id: None,
            conflict: None,
        });
    }

    let patch = patch.ok_or_else(|| "patch payload is required for approval".to_string())?;
    let ops = patch
        .get("ops")
        .and_then(Value::as_array)
        .ok_or_else(|| "patch.ops must be an array".to_string())?;
    let first_doc_id = ops
        .iter()
        .find_map(|op| op.get("docId").and_then(Value::as_str))
        .ok_or_else(|| "patch ops must include docId".to_string())?
        .to_string();

    let mut guard = state.inner.lock().map_err(|_| "state lock poisoned".to_string())?;
    let root = guard.root.clone().ok_or_else(|| "workspace is not open".to_string())?;
    let document = guard
        .documents
        .get(&first_doc_id)
        .cloned()
        .ok_or_else(|| format!("document not found: {first_doc_id}"))?;
    let next_body = apply_ops(&document.body, ops)?;
    let target = root.join(&document.path);
    let fs_body = fs::read_to_string(&target).map_err(|err| err.to_string())?;
    let fs_body_sha256 = sha256_hex(fs_body.as_bytes());
    let expected_body_sha256 = expected_body
        .as_ref()
        .map(|body| sha256_hex(body.as_bytes()))
        .unwrap_or_else(|| document.body_sha256.clone());
    if fs_body_sha256 != expected_body_sha256 {
        return Ok(ApplyPatchResponse {
            status: "conflict".to_string(),
            document: None,
            file_path: None,
            patch_id: Some(run_id),
            doc_id: Some(document.id.clone()),
            conflict: Some(WorkspaceConflict {
                doc_id: document.id,
                path: document.path,
                reason: "rev_conflict".to_string(),
                db_rev: document.rev,
                db_body_sha256: document.body_sha256,
                fs_body_sha256: Some(fs_body_sha256),
            }),
        });
    }

    let mut updated = document.clone();
    updated.body = next_body;
    updated.body_sha256 = sha256_hex(updated.body.as_bytes());
    updated.rev += 1;
    updated.last_editor = "agent".to_string();
    guard.self_write_shas.insert(updated.path.clone(), updated.body_sha256.clone());
    let file_path = match write_doc_file_atomically(&root, &updated.path, &updated.body, &updated.id) {
        Ok(file_path) => file_path,
        Err(error) => {
            guard.self_write_shas.remove(&updated.path);
            return Err(error);
        }
    };
    guard.documents.insert(updated.id.clone(), updated.clone());
    drop(guard);

    let _ = app.emit(
        "doc_changed",
        DocChangedPayload {
            doc_id: updated.id.clone(),
            rev: updated.rev,
            source: "agent".to_string(),
        },
    );
    let _ = app.emit(
        "agent_run_completed",
        serde_json::json!({ "run_id": run_id, "patch_id": run_id }),
    );

    Ok(ApplyPatchResponse {
        status: "applied".to_string(),
        document: Some(updated),
        file_path: Some(file_path.to_string_lossy().to_string()),
        patch_id: Some(run_id),
        doc_id: None,
        conflict: None,
    })
}

#[tauri::command]
async fn list_pending_approvals(state: tauri::State<'_, AppState>) -> Result<Vec<Value>, String> {
    let guard = state.inner.lock().map_err(|_| "state lock poisoned".to_string())?;
    let workspace_id = guard.workspace_id.clone().ok_or_else(|| "workspace is not open".to_string())?;
    let port = guard.agent_server_port.ok_or_else(|| "agent server is not running".to_string())?;
    drop(guard);

    let response = http_get_json(port, &format!("/patches?status=proposed&workspaceId={workspace_id}"))?;
    Ok(response
        .get("patches")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            open_workspace,
            list_documents,
            read_doc,
            create_doc,
            apply_patch,
            list_pending_approvals
        ])
        .setup(|app| {
            let _ = app.handle().emit(
                "agent_run_progress",
                serde_json::json!({ "phase": "boot", "message": "desktop.shell.ready" }),
            );
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running WekiDocs desktop shell");
}

fn normalize_doc_path(input: &str) -> Result<String, String> {
    let normalized = input.replace('\\', "/").trim_start_matches('/').to_string();
    if !normalized.ends_with(".md") || normalized.split('/').any(|part| part.is_empty() || part == "..") {
        return Err(format!("invalid markdown document path: {input}"));
    }
    Ok(normalized)
}

fn write_doc_file_atomically(root: &Path, doc_path: &str, body: &str, doc_id: &str) -> Result<PathBuf, String> {
    let target = root.join(doc_path);
    if !target.starts_with(root) {
        return Err("document path escapes workspace root".to_string());
    }
    let target_dir = target.parent().ok_or_else(|| "document path has no parent".to_string())?;
    let tmp_dir = root.join(".weki").join(".tmp");
    fs::create_dir_all(target_dir).map_err(|err| err.to_string())?;
    fs::create_dir_all(&tmp_dir).map_err(|err| err.to_string())?;

    let tmp_path = tmp_dir.join(format!("{doc_id}.{}.tmp", unix_nanos()));
    fs::write(&tmp_path, body).map_err(|err| err.to_string())?;
    if cfg!(windows) && target.exists() {
        fs::remove_file(&target).map_err(|err| err.to_string())?;
    }
    fs::rename(&tmp_path, &target).map_err(|err| {
        let _ = fs::remove_file(&tmp_path);
        err.to_string()
    })?;
    Ok(target)
}

fn start_workspace_watcher(
    root: PathBuf,
    state: Arc<Mutex<DesktopState>>,
    app: tauri::AppHandle,
) -> Result<RecommendedWatcher, String> {
    let watch_root = root.clone();
    let mut watcher = RecommendedWatcher::new(
        move |result: Result<notify::Event, notify::Error>| {
            if let Ok(event) = result {
                for path in event.paths {
                    if path.extension().and_then(|ext| ext.to_str()) == Some("md") {
                        let _ = reconcile_external_path(&root, &path, &state, &app);
                    }
                }
            }
        },
        Config::default(),
    )
    .map_err(|err| err.to_string())?;
    watcher
        .watch(&watch_root, RecursiveMode::Recursive)
        .map_err(|err| err.to_string())?;
    Ok(watcher)
}

fn reconcile_external_path(
    root: &Path,
    path: &Path,
    state: &Arc<Mutex<DesktopState>>,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    if path
        .components()
        .any(|component| component.as_os_str().to_string_lossy() == ".weki")
    {
        return Ok(());
    }

    let doc_path = path
        .strip_prefix(root)
        .map_err(|err| err.to_string())?
        .to_string_lossy()
        .replace('\\', "/");
    let body = fs::read_to_string(path).map_err(|err| err.to_string())?;
    let body_sha256 = sha256_hex(body.as_bytes());
    let mut guard = state.lock().map_err(|_| "state lock poisoned".to_string())?;

    if guard
        .self_write_shas
        .get(&doc_path)
        .is_some_and(|expected| expected == &body_sha256)
    {
        guard.self_write_shas.remove(&doc_path);
        return Ok(());
    }

    let document = if let Some(existing) = guard.documents.values_mut().find(|doc| doc.path == doc_path) {
        if existing.body_sha256 == body_sha256 {
            return Ok(());
        }
        existing.body = body;
        existing.body_sha256 = body_sha256;
        existing.rev += 1;
        existing.last_editor = "human".to_string();
        existing.clone()
    } else {
        let document = DocumentRecord {
            id: make_uuid_like(),
            path: doc_path,
            body_sha256,
            body,
            rev: 1,
            last_editor: "human".to_string(),
        };
        guard.documents.insert(document.id.clone(), document.clone());
        document
    };
    drop(guard);

    let _ = app.emit(
        "doc_changed",
        DocChangedPayload {
            doc_id: document.id,
            rev: document.rev,
            source: "sync".to_string(),
        },
    );
    Ok(())
}

fn load_markdown_documents(root: &Path) -> Result<HashMap<String, DocumentRecord>, String> {
    let mut documents = HashMap::new();
    collect_markdown_documents(root, root, &mut documents)?;
    Ok(documents)
}

fn collect_markdown_documents(
    root: &Path,
    current: &Path,
    documents: &mut HashMap<String, DocumentRecord>,
) -> Result<(), String> {
    for entry in fs::read_dir(current).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        let path = entry.path();
        if path.file_name().and_then(|name| name.to_str()) == Some(".weki") {
            continue;
        }
        if path.is_dir() {
            collect_markdown_documents(root, &path, documents)?;
            continue;
        }
        if path.extension().and_then(|ext| ext.to_str()) != Some("md") {
            continue;
        }
        let body = fs::read_to_string(&path).map_err(|err| err.to_string())?;
        let doc_path = path
            .strip_prefix(root)
            .map_err(|err| err.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let document = DocumentRecord {
            id: make_uuid_like(),
            path: doc_path,
            body_sha256: sha256_hex(body.as_bytes()),
            body,
            rev: 1,
            last_editor: "human".to_string(),
        };
        documents.insert(document.id.clone(), document);
    }
    Ok(())
}

fn reserve_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(|err| err.to_string())?;
    let port = listener.local_addr().map_err(|err| err.to_string())?.port();
    drop(listener);
    Ok(port)
}

fn spawn_agent_server(port: u16) -> Result<Child, String> {
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .ancestors()
        .nth(3)
        .ok_or_else(|| "cannot locate repo root".to_string())?;
    let port_text = port.to_string();
    let pnpm_args = [
            "--filter",
            "@weki/agent-server",
            "run",
            "server",
            "--",
            "--host",
            "127.0.0.1",
            "--port",
            &port_text,
        ];
    let mut command = if let Ok(npm_execpath) = std::env::var("npm_execpath") {
        let mut command = Command::new("node");
        command.arg(npm_execpath);
        command
    } else if cfg!(windows) {
        let pnpm_ps1 = std::env::var("APPDATA")
            .map(|appdata| Path::new(&appdata).join("npm").join("pnpm.ps1"))
            .map_err(|_| "APPDATA is not set; cannot locate pnpm.ps1".to_string())?;
        let mut command = Command::new("powershell");
        command.args(["-ExecutionPolicy", "Bypass", "-File"]);
        command.arg(pnpm_ps1);
        command
    } else {
        Command::new("pnpm")
    };
    let mut child = command
        .current_dir(repo_root)
        .args(pnpm_args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| format!("failed to spawn agent-server: {err}"))?;

    let stdout = child.stdout.take().ok_or_else(|| "agent-server stdout unavailable".to_string())?;
    let started = wait_for_agent_ready(stdout, Duration::from_secs(15));
    if let Err(error) = started {
        let _ = child.kill();
        return Err(error);
    }
    Ok(child)
}

fn wait_for_agent_ready(stdout: impl std::io::Read, timeout: Duration) -> Result<(), String> {
    let started_at = SystemTime::now();
    let reader = BufReader::new(stdout);
    for line in reader.lines() {
        let line = line.map_err(|err| err.to_string())?;
        if line.contains("WEKI_AGENT_SERVER_READY") {
            return Ok(());
        }
        if started_at.elapsed().unwrap_or_default() > timeout {
            return Err("timed out waiting for agent-server".to_string());
        }
    }
    Err("agent-server exited before ready".to_string())
}

fn http_get_json(port: u16, path: &str) -> Result<Value, String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).map_err(|err| err.to_string())?;
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nAccept: application/json\r\n\r\n"
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|err| err.to_string())?;
    let mut response = String::new();
    stream
        .read_to_string(&mut response)
        .map_err(|err| err.to_string())?;
    let (head, body) = response
        .split_once("\r\n\r\n")
        .ok_or_else(|| "invalid HTTP response from agent-server".to_string())?;
    if !head.starts_with("HTTP/1.1 200") && !head.starts_with("HTTP/1.0 200") {
        return Err(format!("agent-server request failed: {head}"));
    }
    serde_json::from_str(body).map_err(|err| err.to_string())
}

fn apply_ops(body: &str, ops: &[Value]) -> Result<String, String> {
    let mut current = body.to_string();
    for op in ops {
        match op.get("kind").and_then(Value::as_str) {
            Some("insert_section_tree") => {
                if current.trim().is_empty() {
                    let sections = op
                        .get("sections")
                        .and_then(Value::as_array)
                        .ok_or_else(|| "insert_section_tree.sections must be an array".to_string())?;
                    current = sections
                        .iter()
                        .filter_map(|section| {
                            let heading = section.get("heading")?.as_str()?;
                            let level = section.get("level").and_then(Value::as_u64).unwrap_or(2);
                            Some(format!("{} {}", "#".repeat(level as usize), heading))
                        })
                        .collect::<Vec<_>>()
                        .join("\n\n");
                    current.push('\n');
                }
            }
            Some("append_paragraph") => {
                let text = op
                    .get("text")
                    .and_then(Value::as_str)
                    .ok_or_else(|| "append_paragraph.text is required".to_string())?;
                let heading = op.get("sectionHeading").and_then(Value::as_str);
                if let Some(heading) = heading {
                    current = append_paragraph_to_heading(&current, heading, text);
                } else {
                    current.push_str(&format!("\n\n{text}\n"));
                }
            }
            Some("replace_range") => {
                let from = op.get("from").and_then(Value::as_u64).ok_or_else(|| "from missing".to_string())? as usize;
                let to = op.get("to").and_then(Value::as_u64).ok_or_else(|| "to missing".to_string())? as usize;
                let text = op.get("text").and_then(Value::as_str).ok_or_else(|| "text missing".to_string())?;
                if from > to || to > current.len() {
                    return Err("replace_range is out of bounds".to_string());
                }
                current.replace_range(from..to, text);
            }
            Some(kind) => return Err(format!("unsupported patch op: {kind}")),
            None => return Err("patch op kind is required".to_string()),
        }
    }
    Ok(current)
}

fn append_paragraph_to_heading(body: &str, heading: &str, text: &str) -> String {
    if let Some((level, heading_end)) = find_heading(body, heading) {
        let insert_at = find_section_end(body, heading_end, level);
        let prefix = body[..insert_at].trim_end();
        let suffix = body[insert_at..].trim_start();
        let inserted = format!("{prefix}\n\n{text}\n");
        if suffix.is_empty() {
            inserted
        } else {
            format!("{inserted}\n{suffix}")
        }
    } else {
        format!("{}\n\n## {heading}\n\n{text}\n", body.trim_end())
    }
}

fn find_heading(body: &str, heading: &str) -> Option<(usize, usize)> {
    let mut offset = 0;
    for line in body.split_inclusive('\n') {
        let trimmed = line.trim_end_matches(['\r', '\n']);
        let hashes = trimmed.chars().take_while(|char| *char == '#').count();
        if (1..=6).contains(&hashes) && trimmed[hashes..].trim() == heading {
            return Some((hashes, offset + line.len()));
        }
        offset += line.len();
    }
    None
}

fn find_section_end(body: &str, from: usize, level: usize) -> usize {
    let mut offset = from;
    for line in body[from..].split_inclusive('\n') {
        let trimmed = line.trim_start();
        let hashes = trimmed.chars().take_while(|char| *char == '#').count();
        if (1..=level).contains(&hashes) && trimmed.chars().nth(hashes) == Some(' ') {
            return offset;
        }
        offset += line.len();
    }
    body.len()
}

fn make_uuid_like() -> String {
    let nanos = unix_nanos();
    let pid = std::process::id() as u128;
    let mixed = nanos ^ (pid << 64);
    format!(
        "{:08x}-{:04x}-4{:03x}-8{:03x}-{:012x}",
        (mixed >> 96) as u32,
        (mixed >> 80) as u16,
        (mixed >> 64) as u16 & 0x0fff,
        (mixed >> 48) as u16 & 0x0fff,
        mixed & 0x0000_ffff_ffff_ffff
    )
}

fn unix_nanos() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos()
}

fn sha256_hex(input: &[u8]) -> String {
    const H0: [u32; 8] = [
        0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ];
    const K: [u32; 64] = [
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
    ];

    let mut data = input.to_vec();
    let bit_len = (data.len() as u64) * 8;
    data.push(0x80);
    while (data.len() % 64) != 56 {
        data.push(0);
    }
    data.extend_from_slice(&bit_len.to_be_bytes());

    let mut h = H0;
    for chunk in data.chunks(64) {
        let mut w = [0u32; 64];
        for (index, word) in w.iter_mut().take(16).enumerate() {
            let offset = index * 4;
            *word = u32::from_be_bytes([chunk[offset], chunk[offset + 1], chunk[offset + 2], chunk[offset + 3]]);
        }
        for index in 16..64 {
            let s0 = w[index - 15].rotate_right(7) ^ w[index - 15].rotate_right(18) ^ (w[index - 15] >> 3);
            let s1 = w[index - 2].rotate_right(17) ^ w[index - 2].rotate_right(19) ^ (w[index - 2] >> 10);
            w[index] = w[index - 16]
                .wrapping_add(s0)
                .wrapping_add(w[index - 7])
                .wrapping_add(s1);
        }

        let mut a = h[0];
        let mut b = h[1];
        let mut c = h[2];
        let mut d = h[3];
        let mut e = h[4];
        let mut f = h[5];
        let mut g = h[6];
        let mut hh = h[7];

        for index in 0..64 {
            let s1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let ch = (e & f) ^ ((!e) & g);
            let temp1 = hh
                .wrapping_add(s1)
                .wrapping_add(ch)
                .wrapping_add(K[index])
                .wrapping_add(w[index]);
            let s0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let maj = (a & b) ^ (a & c) ^ (b & c);
            let temp2 = s0.wrapping_add(maj);

            hh = g;
            g = f;
            f = e;
            e = d.wrapping_add(temp1);
            d = c;
            c = b;
            b = a;
            a = temp1.wrapping_add(temp2);
        }

        h[0] = h[0].wrapping_add(a);
        h[1] = h[1].wrapping_add(b);
        h[2] = h[2].wrapping_add(c);
        h[3] = h[3].wrapping_add(d);
        h[4] = h[4].wrapping_add(e);
        h[5] = h[5].wrapping_add(f);
        h[6] = h[6].wrapping_add(g);
        h[7] = h[7].wrapping_add(hh);
    }

    h.iter().map(|word| format!("{word:08x}")).collect::<String>()
}
