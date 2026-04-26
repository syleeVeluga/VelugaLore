CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner','admin','editor','reader')),
  PRIMARY KEY (org_id, user_id)
);

CREATE TABLE workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name text NOT NULL,
  fs_root text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

CREATE TABLE raw_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  uri text NOT NULL,
  mime text NOT NULL,
  sha256 bytea NOT NULL,
  bytes bigint NOT NULL,
  imported_by uuid REFERENCES users(id),
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, sha256)
);

CREATE OR REPLACE FUNCTION raw_sources_no_update() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'raw_sources is immutable';
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_raw_sources_no_update
  BEFORE UPDATE ON raw_sources
  FOR EACH ROW EXECUTE FUNCTION raw_sources_no_update();

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  path text NOT NULL,
  title text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('concept','entity','source','overview','index','log','qa','summary','slides','draft','stub')),
  body text NOT NULL DEFAULT '',
  body_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,''))) STORED,
  frontmatter jsonb NOT NULL DEFAULT '{}'::jsonb,
  rev bigint NOT NULL DEFAULT 1,
  body_sha256 bytea NOT NULL,
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id),
  last_editor text NOT NULL CHECK (last_editor IN ('human','agent')) DEFAULT 'human',
  UNIQUE (workspace_id, path)
);

CREATE INDEX documents_kind_idx ON documents (workspace_id, kind);
CREATE INDEX documents_updated_idx ON documents (workspace_id, updated_at DESC);
CREATE INDEX documents_body_tsv_idx ON documents USING gin (body_tsv);
CREATE INDEX documents_body_trgm_idx ON documents USING gin (body gin_trgm_ops);
CREATE INDEX documents_frontmatter_idx ON documents USING gin (frontmatter jsonb_path_ops);
CREATE INDEX documents_embedding_idx ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TABLE import_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  invoked_by uuid REFERENCES users(id),
  source_kind text NOT NULL CHECK (source_kind IN ('folder','zip','docx','md','notion_export','confluence_export','google_docs','html','mixed')),
  source_summary jsonb NOT NULL,
  options jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','partial','failed','rolled_back')),
  doc_count int NOT NULL DEFAULT 0,
  attachment_count int NOT NULL DEFAULT 0,
  conflict_count int NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  rollback_of uuid REFERENCES import_runs(id),
  notes text
);
CREATE INDEX import_runs_workspace_time ON import_runs (workspace_id, started_at DESC);

CREATE TABLE links (
  src_doc_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  dst_doc_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'wikilink' CHECK (kind IN ('wikilink','embed','citation','derived_from')),
  occurrences int NOT NULL DEFAULT 1,
  PRIMARY KEY (src_doc_id, dst_doc_id, kind)
);

CREATE OR REPLACE FUNCTION links_same_workspace() RETURNS trigger AS $$
DECLARE
  src_workspace uuid;
  dst_workspace uuid;
BEGIN
  SELECT workspace_id INTO src_workspace FROM documents WHERE id = NEW.src_doc_id;
  SELECT workspace_id INTO dst_workspace FROM documents WHERE id = NEW.dst_doc_id;

  IF src_workspace IS NULL OR dst_workspace IS NULL OR src_workspace <> dst_workspace THEN
    RAISE EXCEPTION 'links endpoints must belong to the same workspace';
  END IF;

  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_links_same_workspace
  BEFORE INSERT OR UPDATE ON links
  FOR EACH ROW EXECUTE FUNCTION links_same_workspace();

CREATE TABLE tags (
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  PRIMARY KEY (workspace_id, name)
);

CREATE TABLE document_tags (
  doc_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  PRIMARY KEY (doc_id, name),
  FOREIGN KEY (workspace_id, name) REFERENCES tags(workspace_id, name) ON DELETE CASCADE
);

CREATE TABLE doc_versions (
  doc_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  rev bigint NOT NULL,
  body text NOT NULL,
  body_sha256 bytea NOT NULL,
  frontmatter jsonb NOT NULL,
  source text NOT NULL CHECK (source IN ('human','agent','sync')),
  agent_run_id uuid,
  committed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (doc_id, rev)
);

CREATE TABLE agents (
  id text PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id),
  version text NOT NULL,
  capabilities jsonb NOT NULL,
  prompt_path text,
  enabled bool NOT NULL DEFAULT true,
  UNIQUE (id, workspace_id)
);

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  invoked_by uuid REFERENCES users(id),
  invocation jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('queued','running','succeeded','failed','rejected')),
  patch jsonb,
  cost_tokens int,
  cost_usd_microcents bigint,
  model text,
  started_at timestamptz,
  finished_at timestamptz,
  error text,
  parent_run_id uuid REFERENCES agent_runs(id)
);
CREATE INDEX agent_runs_workspace_time ON agent_runs (workspace_id, started_at DESC);

CREATE OR REPLACE FUNCTION agent_runs_status_only_update() RETURNS trigger AS $$
BEGIN
  IF OLD.workspace_id IS DISTINCT FROM NEW.workspace_id
    OR OLD.agent_id IS DISTINCT FROM NEW.agent_id
    OR OLD.invoked_by IS DISTINCT FROM NEW.invoked_by
    OR OLD.invocation IS DISTINCT FROM NEW.invocation
    OR OLD.patch IS DISTINCT FROM NEW.patch
    OR OLD.cost_tokens IS DISTINCT FROM NEW.cost_tokens
    OR OLD.cost_usd_microcents IS DISTINCT FROM NEW.cost_usd_microcents
    OR OLD.model IS DISTINCT FROM NEW.model
    OR OLD.parent_run_id IS DISTINCT FROM NEW.parent_run_id THEN
    RAISE EXCEPTION 'agent_runs is append-only except status timestamps and error';
  END IF;

  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER tg_agent_runs_status_only_update
  BEFORE UPDATE ON agent_runs
  FOR EACH ROW EXECUTE FUNCTION agent_runs_status_only_update();

CREATE TABLE patches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_run_id uuid NOT NULL REFERENCES agent_runs(id) ON DELETE CASCADE,
  ops jsonb NOT NULL,
  preview_html text,
  status text NOT NULL CHECK (status IN ('proposed','applied','rejected','superseded')) DEFAULT 'proposed',
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  workspace_id uuid REFERENCES workspaces(id),
  actor_kind text NOT NULL CHECK (actor_kind IN ('user','agent','system')),
  actor_id text NOT NULL,
  action text NOT NULL,
  target_kind text,
  target_id text,
  payload jsonb,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE triples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  s_doc_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  p text NOT NULL,
  o_doc_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  o_literal jsonb,
  weight real NOT NULL DEFAULT 1.0,
  source text NOT NULL CHECK (source IN ('agent','human','derived')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX triples_spo ON triples (workspace_id, s_doc_id, p);
CREATE INDEX triples_pos ON triples (workspace_id, p, o_doc_id);

CREATE OR REPLACE FUNCTION app_user_id() RETURNS uuid AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION current_user_org_ids() RETURNS uuid[] AS $$
  SELECT coalesce(array_agg(org_id), ARRAY[]::uuid[])
  FROM memberships
  WHERE user_id = app_user_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION app_role_for_org(target_org_id uuid) RETURNS text AS $$
  SELECT role
  FROM memberships
  WHERE org_id = target_org_id
    AND user_id = app_user_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION app_role_for_workspace(target_workspace_id uuid) RETURNS text AS $$
  SELECT m.role
  FROM memberships m
  JOIN workspaces w ON w.org_id = m.org_id
  WHERE w.id = target_workspace_id
    AND m.user_id = app_user_id();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION app_can_read_workspace(target_workspace_id uuid) RETURNS boolean AS $$
  SELECT app_role_for_workspace(target_workspace_id) IN ('owner','admin','editor','reader');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION app_can_write_workspace(target_workspace_id uuid) RETURNS boolean AS $$
  SELECT app_role_for_workspace(target_workspace_id) IN ('owner','admin','editor');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION app_can_admin_workspace(target_workspace_id uuid) RETURNS boolean AS $$
  SELECT app_role_for_workspace(target_workspace_id) IN ('owner','admin');
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION app_audit_write_denied(
  target_workspace_id uuid,
  target_kind text,
  target_id text,
  attempted_action text,
  details jsonb DEFAULT '{}'::jsonb
) RETURNS void AS $$
BEGIN
  INSERT INTO audit_log (workspace_id, actor_kind, actor_id, action, target_kind, target_id, payload)
  VALUES (
    target_workspace_id,
    'user',
    coalesce(app_user_id()::text, 'anonymous'),
    'write_denied',
    target_kind,
    target_id,
    jsonb_build_object('attempted_action', attempted_action, 'details', details)
  );
END
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION app_update_document_body(
  target_doc_id uuid,
  expected_rev bigint,
  new_body text,
  actor text DEFAULT 'human'
) RETURNS boolean AS $$
DECLARE
  target_workspace uuid;
  previous_rev bigint;
  previous_frontmatter jsonb;
BEGIN
  SELECT workspace_id, rev, frontmatter
    INTO target_workspace, previous_rev, previous_frontmatter
    FROM documents
    WHERE id = target_doc_id;

  IF target_workspace IS NULL THEN
    RETURN false;
  END IF;

  IF NOT app_can_write_workspace(target_workspace) THEN
    PERFORM app_audit_write_denied(target_workspace, 'document', target_doc_id::text, 'documents.update');
    RETURN false;
  END IF;

  UPDATE documents
    SET body = new_body,
        body_sha256 = digest(new_body, 'sha256'),
        rev = rev + 1,
        updated_at = now(),
        last_editor = actor
    WHERE id = target_doc_id
      AND rev = expected_rev;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  INSERT INTO doc_versions (doc_id, rev, body, body_sha256, frontmatter, source)
    VALUES (target_doc_id, previous_rev + 1, new_body, digest(new_body, 'sha256'), previous_frontmatter, actor);

  RETURN true;
END
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE doc_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE patches ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE triples ENABLE ROW LEVEL SECURITY;

CREATE POLICY orgs_member_select ON orgs
  FOR SELECT USING (id = ANY (current_user_org_ids()));

CREATE POLICY users_self_select ON users
  FOR SELECT USING (
    id = app_user_id()
    OR EXISTS (
      SELECT 1
      FROM memberships self
      JOIN memberships other_member ON other_member.org_id = self.org_id
      WHERE self.user_id = app_user_id()
        AND other_member.user_id = users.id
    )
  );

CREATE POLICY memberships_member_select ON memberships
  FOR SELECT USING (org_id = ANY (current_user_org_ids()));

CREATE POLICY memberships_owner_write ON memberships
  FOR ALL USING (app_role_for_org(org_id) = 'owner')
  WITH CHECK (app_role_for_org(org_id) = 'owner');

CREATE POLICY workspaces_member_select ON workspaces
  FOR SELECT USING (org_id = ANY (current_user_org_ids()));

CREATE POLICY workspaces_admin_insert ON workspaces
  FOR INSERT WITH CHECK (app_role_for_org(org_id) IN ('owner','admin'));

CREATE POLICY workspaces_admin_update ON workspaces
  FOR UPDATE USING (app_role_for_org(org_id) IN ('owner','admin'))
  WITH CHECK (app_role_for_org(org_id) IN ('owner','admin'));

CREATE POLICY workspaces_owner_delete ON workspaces
  FOR DELETE USING (app_role_for_org(org_id) = 'owner');

CREATE POLICY raw_sources_member_select ON raw_sources
  FOR SELECT USING (app_can_read_workspace(workspace_id));

CREATE POLICY raw_sources_editor_insert ON raw_sources
  FOR INSERT WITH CHECK (app_can_write_workspace(workspace_id));

CREATE POLICY documents_member_select ON documents
  FOR SELECT USING (app_can_read_workspace(workspace_id));

CREATE POLICY documents_editor_insert ON documents
  FOR INSERT WITH CHECK (app_can_write_workspace(workspace_id));

CREATE POLICY documents_editor_update ON documents
  FOR UPDATE USING (app_can_write_workspace(workspace_id))
  WITH CHECK (app_can_write_workspace(workspace_id));

CREATE POLICY documents_admin_delete ON documents
  FOR DELETE USING (app_can_admin_workspace(workspace_id));

CREATE POLICY import_runs_member_select ON import_runs
  FOR SELECT USING (app_can_read_workspace(workspace_id));

CREATE POLICY import_runs_admin_insert ON import_runs
  FOR INSERT WITH CHECK (app_can_admin_workspace(workspace_id));

CREATE POLICY import_runs_admin_update ON import_runs
  FOR UPDATE USING (app_can_admin_workspace(workspace_id))
  WITH CHECK (app_can_admin_workspace(workspace_id));

CREATE POLICY links_member_select ON links
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = links.src_doc_id
        AND app_can_read_workspace(d.workspace_id)
    )
  );

CREATE POLICY links_editor_write ON links
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = links.src_doc_id
        AND app_can_write_workspace(d.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = links.src_doc_id
        AND app_can_write_workspace(d.workspace_id)
    )
  );

CREATE POLICY tags_member_select ON tags
  FOR SELECT USING (app_can_read_workspace(workspace_id));

CREATE POLICY tags_editor_write ON tags
  FOR ALL USING (app_can_write_workspace(workspace_id))
  WITH CHECK (app_can_write_workspace(workspace_id));

CREATE POLICY document_tags_member_select ON document_tags
  FOR SELECT USING (app_can_read_workspace(workspace_id));

CREATE POLICY document_tags_editor_write ON document_tags
  FOR ALL USING (app_can_write_workspace(workspace_id))
  WITH CHECK (app_can_write_workspace(workspace_id));

CREATE POLICY doc_versions_member_select ON doc_versions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = doc_versions.doc_id
        AND app_can_read_workspace(d.workspace_id)
    )
  );

CREATE POLICY doc_versions_editor_insert ON doc_versions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents d
      WHERE d.id = doc_versions.doc_id
        AND app_can_write_workspace(d.workspace_id)
    )
  );

CREATE POLICY agents_member_select ON agents
  FOR SELECT USING (workspace_id IS NULL OR app_can_read_workspace(workspace_id));

CREATE POLICY agents_admin_write ON agents
  FOR ALL USING (workspace_id IS NULL OR app_can_admin_workspace(workspace_id))
  WITH CHECK (workspace_id IS NULL OR app_can_admin_workspace(workspace_id));

CREATE POLICY agent_runs_member_select ON agent_runs
  FOR SELECT USING (app_can_read_workspace(workspace_id));

CREATE POLICY agent_runs_editor_insert ON agent_runs
  FOR INSERT WITH CHECK (app_can_write_workspace(workspace_id));

CREATE POLICY agent_runs_status_update ON agent_runs
  FOR UPDATE USING (app_can_write_workspace(workspace_id))
  WITH CHECK (app_can_write_workspace(workspace_id));

CREATE POLICY patches_member_select ON patches
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM agent_runs ar
      WHERE ar.id = patches.agent_run_id
        AND app_can_read_workspace(ar.workspace_id)
    )
  );

CREATE POLICY patches_editor_insert ON patches
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_runs ar
      WHERE ar.id = patches.agent_run_id
        AND app_can_write_workspace(ar.workspace_id)
    )
  );

CREATE POLICY patches_editor_update ON patches
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM agent_runs ar
      WHERE ar.id = patches.agent_run_id
        AND app_can_write_workspace(ar.workspace_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agent_runs ar
      WHERE ar.id = patches.agent_run_id
        AND app_can_write_workspace(ar.workspace_id)
    )
  );

CREATE POLICY audit_log_member_select ON audit_log
  FOR SELECT USING (workspace_id IS NULL OR app_can_read_workspace(workspace_id));

CREATE POLICY audit_log_insert ON audit_log
  FOR INSERT WITH CHECK (workspace_id IS NULL OR app_can_read_workspace(workspace_id));

CREATE POLICY triples_member_select ON triples
  FOR SELECT USING (app_can_read_workspace(workspace_id));

CREATE POLICY triples_editor_write ON triples
  FOR ALL USING (app_can_write_workspace(workspace_id))
  WITH CHECK (app_can_write_workspace(workspace_id));
