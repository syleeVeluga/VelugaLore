#!/usr/bin/env node
import { agentServerPackage } from "@weki/agent-server";
import { corePackage } from "@weki/core";
import { dbPackage } from "@weki/db";

export const cliPackage = {
  name: "@weki/cli",
  responsibility: "weki command",
  internalDependencies: [corePackage.name, dbPackage.name, agentServerPackage.name]
} as const;
