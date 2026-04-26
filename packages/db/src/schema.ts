import {
  agentRunStatuses,
  auditActorKinds,
  documentKinds,
  docVersionSources,
  importRunStatuses,
  importSourceKinds,
  lastEditors,
  linkKinds,
  membershipRoles,
  patchStatuses,
  tripleSources
} from "@weki/core";
import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  }
});

const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  }
});

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  }
});

const vector = customType<{ data: number[]; config: { dimensions: number } }>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 1536})`;
  }
});

export const dbEnumValues = {
  membershipRoles,
  documentKinds,
  linkKinds,
  importSourceKinds,
  importRunStatuses,
  docVersionSources,
  agentRunStatuses,
  patchStatuses,
  auditActorKinds,
  lastEditors,
  tripleSources
} as const;

export const orgs = pgTable("orgs", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const memberships = pgTable(
  "memberships",
  {
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: membershipRoles }).notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.orgId, table.userId] })
  })
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    fsRoot: text("fs_root"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    orgNameUnique: unique("workspaces_org_name_unique").on(table.orgId, table.name)
  })
);

export const rawSources = pgTable(
  "raw_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    uri: text("uri").notNull(),
    mime: text("mime").notNull(),
    sha256: bytea("sha256").notNull(),
    bytes: bigint("bytes", { mode: "bigint" }).notNull(),
    importedBy: uuid("imported_by").references(() => users.id),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    workspaceShaUnique: unique("raw_sources_workspace_sha_unique").on(table.workspaceId, table.sha256)
  })
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    title: text("title").notNull(),
    kind: text("kind", { enum: documentKinds }).notNull(),
    body: text("body").notNull().default(""),
    bodyTsv: tsvector("body_tsv"),
    frontmatter: jsonb("frontmatter").notNull().default({}),
    rev: bigint("rev", { mode: "bigint" }).notNull().default(1n),
    bodySha256: bytea("body_sha256").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => users.id),
    lastEditor: text("last_editor", { enum: lastEditors }).notNull().default("human")
  },
  (table) => ({
    workspacePathUnique: unique("documents_workspace_path_unique").on(table.workspaceId, table.path),
    kindIdx: index("documents_kind_idx").on(table.workspaceId, table.kind),
    updatedIdx: index("documents_updated_idx").on(table.workspaceId, table.updatedAt)
  })
);

export const importRuns = pgTable(
  "import_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    invokedBy: uuid("invoked_by").references(() => users.id),
    sourceKind: text("source_kind", { enum: importSourceKinds }).notNull(),
    sourceSummary: jsonb("source_summary").notNull(),
    options: jsonb("options").notNull(),
    status: text("status", { enum: importRunStatuses }).notNull(),
    docCount: integer("doc_count").notNull().default(0),
    attachmentCount: integer("attachment_count").notNull().default(0),
    conflictCount: integer("conflict_count").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    rollbackOf: uuid("rollback_of"),
    notes: text("notes")
  },
  (table) => ({
    workspaceTimeIdx: index("import_runs_workspace_time").on(table.workspaceId, table.startedAt)
  })
);

export const links = pgTable(
  "links",
  {
    srcDocId: uuid("src_doc_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    dstDocId: uuid("dst_doc_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: linkKinds }).notNull().default("wikilink"),
    occurrences: integer("occurrences").notNull().default(1)
  },
  (table) => ({
    pk: primaryKey({ columns: [table.srcDocId, table.dstDocId, table.kind] })
  })
);

export const tags = pgTable(
  "tags",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.workspaceId, table.name] })
  })
);

export const documentTags = pgTable(
  "document_tags",
  {
    docId: uuid("doc_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    workspaceId: uuid("workspace_id").notNull(),
    name: text("name").notNull()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.docId, table.name] })
  })
);

export const docVersions = pgTable(
  "doc_versions",
  {
    docId: uuid("doc_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    rev: bigint("rev", { mode: "bigint" }).notNull(),
    body: text("body").notNull(),
    bodySha256: bytea("body_sha256").notNull(),
    frontmatter: jsonb("frontmatter").notNull(),
    source: text("source", { enum: docVersionSources }).notNull(),
    agentRunId: uuid("agent_run_id"),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    pk: primaryKey({ columns: [table.docId, table.rev] })
  })
);

export const agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    workspaceId: uuid("workspace_id").references(() => workspaces.id),
    version: text("version").notNull(),
    capabilities: jsonb("capabilities").notNull(),
    promptPath: text("prompt_path"),
    enabled: boolean("enabled").notNull().default(true)
  },
  (table) => ({
    idWorkspaceUnique: unique("agents_id_workspace_unique").on(table.id, table.workspaceId)
  })
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    agentId: text("agent_id").notNull(),
    invokedBy: uuid("invoked_by").references(() => users.id),
    invocation: jsonb("invocation").notNull(),
    status: text("status", { enum: agentRunStatuses }).notNull(),
    patch: jsonb("patch"),
    costTokens: integer("cost_tokens"),
    costUsdMicrocents: bigint("cost_usd_microcents", { mode: "bigint" }),
    model: text("model"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    error: text("error"),
    parentRunId: uuid("parent_run_id")
  },
  (table) => ({
    workspaceTimeIdx: index("agent_runs_workspace_time").on(table.workspaceId, table.startedAt)
  })
);

export const patches = pgTable("patches", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentRunId: uuid("agent_run_id")
    .notNull()
    .references(() => agentRuns.id, { onDelete: "cascade" }),
  ops: jsonb("ops").notNull(),
  previewHtml: text("preview_html"),
  status: text("status", { enum: patchStatuses }).notNull().default("proposed"),
  decidedBy: uuid("decided_by").references(() => users.id),
  decidedAt: timestamp("decided_at", { withTimezone: true })
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id),
  actorKind: text("actor_kind", { enum: auditActorKinds }).notNull(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  targetKind: text("target_kind"),
  targetId: text("target_id"),
  payload: jsonb("payload"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow()
});

export const triples = pgTable(
  "triples",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    sDocId: uuid("s_doc_id").references(() => documents.id, { onDelete: "cascade" }),
    p: text("p").notNull(),
    oDocId: uuid("o_doc_id").references(() => documents.id, { onDelete: "cascade" }),
    oLiteral: jsonb("o_literal"),
    weight: real("weight").notNull().default(1),
    source: text("source", { enum: tripleSources }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    spoIdx: index("triples_spo").on(table.workspaceId, table.sDocId, table.p),
    posIdx: index("triples_pos").on(table.workspaceId, table.p, table.oDocId)
  })
);
