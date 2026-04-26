#!/usr/bin/env node
import { createAgentDaemon } from "./daemon.js";

type ServerArgs = {
  host: string;
  port: number;
};

function parseArgs(argv: readonly string[]): ServerArgs {
  const args: ServerArgs = {
    host: "127.0.0.1",
    port: 0
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--host" && next) {
      args.host = next;
      index += 1;
      continue;
    }

    if (arg === "--port" && next) {
      const port = Number(next);
      if (!Number.isInteger(port) || port < 0 || port > 65_535) {
        throw new Error(`Invalid --port value: ${next}`);
      }
      args.port = port;
      index += 1;
    }
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));
const daemon = createAgentDaemon();

daemon.server.listen(args.port, args.host, () => {
  const address = daemon.server.address();
  const port = typeof address === "object" && address ? address.port : args.port;
  process.stdout.write(
    JSON.stringify({
      event: "WEKI_AGENT_SERVER_READY",
      host: args.host,
      port
    }) + "\n"
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    daemon.server.close(() => {
      process.exit(0);
    });
  });
}
