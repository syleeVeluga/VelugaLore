const { existsSync, readdirSync, readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");

const rendererDir = join(__dirname, "..", "dist", "renderer");
const tauriDir = join(__dirname, "..", "src-tauri");
const rendererForbidden = ["x-weki-dev-as-role", "WEKI_DEV_AS_ROLE", "desktop.dev.actAs", "desktop.dev.solo", "Act as"];
const rustBinaryForbidden = rendererForbidden.filter((token) => token !== "WEKI_DEV_AS_ROLE");
const indexHtml = readFileSync(join(rendererDir, "index.html"), "utf8");
const assetFiles = [
  ...[...indexHtml.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) => match[1]),
  ...[...indexHtml.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1])
].map((file) => file.replace(/^\/+/, ""));

for (const file of assetFiles) {
  const body = readFileSync(join(rendererDir, file), "utf8");
  for (const token of rendererForbidden) {
    if (body.includes(token)) {
      throw new Error(`Production renderer bundle must not contain dev act-as token: ${token}`);
    }
  }
}

const rustSource = readFileSync(join(tauriDir, "src", "lib.rs"), "utf8");
for (const [name, pattern] of [
  ["dev_act_as_role", /#\[cfg\(not\(debug_assertions\)\)\]\s*fn\s+dev_act_as_role\s*\(\)\s*->\s*Option<String>/],
  ["apply_dev_act_as_env", /#\[cfg\(not\(debug_assertions\)\)\]\s*fn\s+apply_dev_act_as_env/]
]) {
  if (!pattern.test(rustSource)) {
    throw new Error(`Production Rust act-as strip guard is missing: ${name}`);
  }
}

const releaseDir = join(tauriDir, "target", "release");
if (existsSync(releaseDir)) {
  for (const file of listFiles(releaseDir)) {
    if (!isLikelyReleaseBinary(file)) {
      continue;
    }
    const body = readFileSync(file).toString("latin1");
    for (const token of rustBinaryForbidden) {
      if (body.includes(token)) {
        throw new Error(`Production Rust binary must not contain dev act-as token: ${token}`);
      }
    }
  }
}

function listFiles(root) {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "deps" || entry.name === "build" || entry.name === "incremental") {
        return [];
      }
      return listFiles(full);
    }
    return [full];
  });
}

function isLikelyReleaseBinary(file) {
  const stat = statSync(file);
  if (stat.size === 0 || stat.size > 200 * 1024 * 1024) {
    return false;
  }
  return /\.(exe|dll|dylib|so)$/.test(file) || !/\.[^\\/]+$/.test(file);
}
