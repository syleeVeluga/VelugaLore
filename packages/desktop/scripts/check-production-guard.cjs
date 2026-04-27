const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const rendererDir = join(__dirname, "..", "dist", "renderer");
const forbidden = ["x-weki-dev-as-role", "WEKI_DEV_AS_ROLE", "desktop.dev.actAs", "desktop.dev.solo", "Act as"];
const indexHtml = readFileSync(join(rendererDir, "index.html"), "utf8");
const assetFiles = [
  ...[...indexHtml.matchAll(/<script[^>]+src="([^"]+\.js)"/g)].map((match) => match[1]),
  ...[...indexHtml.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1])
].map((file) => file.replace(/^\/+/, ""));

for (const file of assetFiles) {
  const body = readFileSync(join(rendererDir, file), "utf8");
  for (const token of forbidden) {
    if (body.includes(token)) {
      throw new Error(`Production renderer bundle must not contain dev act-as token: ${token}`);
    }
  }
}
