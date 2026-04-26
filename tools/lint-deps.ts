import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type PackageRule = {
  allowed: Set<string>;
  root: string;
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const packageRules = new Map<string, PackageRule>([
  ["@weki/core", { root: "packages/core", allowed: new Set() }],
  ["@weki/db", { root: "packages/db", allowed: new Set(["@weki/core"]) }],
  ["@weki/editor", { root: "packages/editor", allowed: new Set(["@weki/core"]) }],
  ["@weki/graph", { root: "packages/graph", allowed: new Set(["@weki/core"]) }],
  [
    "@weki/agent-server",
    {
      root: "packages/agent-server",
      allowed: new Set(["@weki/core", "@weki/db", "@weki/markdown-lsp"])
    }
  ],
  ["@weki/markdown-lsp", { root: "packages/markdown-lsp", allowed: new Set(["@weki/core"]) }],
  ["@weki/plugin-sdk", { root: "packages/plugin-sdk", allowed: new Set(["@weki/core"]) }],
  ["@weki/cli", { root: "packages/cli", allowed: new Set(["@weki/core", "@weki/db", "@weki/agent-server"]) }],
  ["@weki/desktop", { root: "packages/desktop", allowed: new Set(["@weki/core", "@weki/editor", "@weki/graph"]) }],
  ["@weki/web", { root: "packages/web", allowed: new Set(["@weki/core", "@weki/editor", "@weki/graph"]) }],
  ["@weki/docs", { root: "apps/docs", allowed: new Set() }],
  ["@weki/marketing", { root: "apps/marketing", allowed: new Set() }]
]);

const rustDependencyRules = new Map<string, Set<string>>([
  ["packages/desktop/src-tauri/Cargo.toml", new Set(["notify", "serde", "serde_json", "tauri", "tauri-build", "tokio"])]
]);

const importPattern =
  /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s*)?["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']\s*\)/g;

function isInsidePath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function listTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "dist" || entry.name === "node_modules") {
          return [];
        }
        return listTsFiles(full);
      }
      return entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name) ? [full] : [];
    })
  );

  return files.flat();
}

function workspacePackageName(specifier: string): string | null {
  if (!specifier.startsWith("@weki/")) {
    return null;
  }

  const [scope, name] = specifier.split("/");
  return name ? `${scope}/${name}` : null;
}

async function exists(dir: string): Promise<boolean> {
  try {
    await stat(dir);
    return true;
  } catch {
    return false;
  }
}

function parseCargoDependencyNames(cargoToml: string): string[] {
  const names: string[] = [];
  let section: "dependencies" | "build-dependencies" | null = null;

  for (const line of cargoToml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "[dependencies]") {
      section = "dependencies";
      continue;
    }
    if (trimmed === "[build-dependencies]") {
      section = "build-dependencies";
      continue;
    }
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      section = null;
      continue;
    }
    if (!section || trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }

    const match = /^([A-Za-z0-9_-]+)\s*=/.exec(trimmed);
    if (match) {
      names.push(match[1]);
    }
  }

  return names;
}

async function main(): Promise<void> {
  const violations: string[] = [];

  for (const [packageName, rule] of packageRules) {
    const packageRoot = path.join(repoRoot, rule.root);
    const srcRoot = path.join(packageRoot, "src");
    if (!(await exists(srcRoot))) {
      continue;
    }

    for (const file of await listTsFiles(srcRoot)) {
      const text = await readFile(file, "utf8");
      let match: RegExpExecArray | null;

      while ((match = importPattern.exec(text))) {
        const specifier = match[1] ?? match[2];
        const targetPackage = workspacePackageName(specifier);

        if (targetPackage && targetPackage !== packageName && !rule.allowed.has(targetPackage)) {
          violations.push(
            `${path.relative(repoRoot, file)} imports ${specifier}; ${packageName} may only import ${[
              ...rule.allowed
            ].join(", ") || "no workspace packages"}`
          );
        }

        if (specifier.startsWith(".")) {
          const resolved = path.resolve(path.dirname(file), specifier);
          if (!isInsidePath(packageRoot, resolved)) {
            violations.push(`${path.relative(repoRoot, file)} reaches outside ${rule.root} with ${specifier}`);
          }
        }
      }
    }
  }

  for (const [relativePath, allowed] of rustDependencyRules) {
    const cargoPath = path.join(repoRoot, relativePath);
    if (!(await exists(cargoPath))) {
      continue;
    }

    const names = parseCargoDependencyNames(await readFile(cargoPath, "utf8"));
    for (const name of names) {
      if (!allowed.has(name)) {
        violations.push(`${relativePath} depends on ${name}; allowed Rust dependencies are ${[...allowed].join(", ")}`);
      }
    }
  }

  if (violations.length > 0) {
    console.error("Dependency boundary check failed:");
    for (const violation of violations) {
      console.error(`  - ${violation}`);
    }
    process.exit(1);
  }

  console.log("Dependency boundary check passed.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
