import { z } from "zod";
import { membershipRoleSchema } from "./domain.js";

export const localUserIdentityFileName = "user.json";
export const localUserIdentityVersion = 1;

export const localUserIdentitySchema = z.object({
  version: z.literal(localUserIdentityVersion).default(localUserIdentityVersion),
  userId: z.string().uuid(),
  displayName: z.string().min(1),
  provisionedAt: z.string().min(1)
});

export const devActAsRoleSchema = membershipRoleSchema;

export type LocalUserIdentity = z.infer<typeof localUserIdentitySchema>;
export type DevActAsRole = z.infer<typeof devActAsRoleSchema>;

export function parseDevActAsRole(value: unknown): DevActAsRole | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const parsed = devActAsRoleSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

export function resolveDevActAsRole(input: {
  value?: unknown;
  isProduction?: boolean;
}): DevActAsRole | undefined {
  if (input.isProduction) {
    return undefined;
  }

  return parseDevActAsRole(input.value);
}
