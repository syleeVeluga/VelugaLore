const { spawnSync } = require("node:child_process");

const task = process.argv[2];

const fallbackArgsByTask = {
  build: [["-r", "run", "build"]],
  test: [
    ["-r", "run", "build"],
    ["-r", "run", "test"]
  ]
};

if (!fallbackArgsByTask[task]) {
  console.error(`[weki] Unsupported root task: ${task ?? "<missing>"}`);
  process.exit(1);
}

function runPnpm(args, captureOutput) {
  return spawnSync("corepack", ["pnpm", ...args], {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: captureOutput ? "pipe" : "inherit"
  });
}

function forwardOutput(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

const turboResult = runPnpm(["exec", "turbo", "run", task], true);
forwardOutput(turboResult);

if (turboResult.status === 0) {
  process.exit(0);
}

const turboOutput = `${turboResult.stdout ?? ""}${turboResult.stderr ?? ""}`;
const canFallback =
  process.platform === "win32" && turboOutput.includes("Unable to find package manager binary");

if (!canFallback) {
  process.exit(turboResult.status ?? 1);
}

const fallbackCommands = fallbackArgsByTask[task];
console.warn(
  `[weki] Turbo could not resolve the pnpm binary on Windows; falling back to root ${task} commands.`
);

for (const fallbackArgs of fallbackCommands) {
  const fallbackResult = runPnpm(fallbackArgs, false);
  if (fallbackResult.status !== 0) {
    process.exit(fallbackResult.status ?? 1);
  }
}

process.exit(0);
