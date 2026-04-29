import { z } from "zod";
import { membershipRoleSchema } from "./domain.js";

export const localUserIdentityFileName = "user.json";
export const localUserIdentityVersion = 1;

export const localUserIdentitySchema = z.object({
  version: z.literal(localUserIdentityVersion).default(localUserIdentityVersion),
  userId: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  displayName: z.string().min(1).optional(),
  display_name: z.string().min(1).optional(),
  provisionedAt: z.string().min(1).optional(),
  provisioned_at: z.string().min(1).optional()
}).transform((value, context) => {
  const userId = value.userId ?? value.user_id;
  const displayName = value.displayName ?? value.display_name;
  if (!userId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Local Solo identity requires user_id"
    });
    return z.NEVER;
  }
  if (!displayName) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Local Solo identity requires display_name"
    });
    return z.NEVER;
  }

  return {
    version: value.version,
    userId,
    displayName,
    provisionedAt: value.provisionedAt ?? value.provisioned_at ?? "1970-01-01T00:00:00.000Z"
  };
});

export const devActAsRoleSchema = membershipRoleSchema;

export type LocalUserIdentity = z.infer<typeof localUserIdentitySchema>;
export type DevActAsRole = z.infer<typeof devActAsRoleSchema>;

export function localUserIdentityToFileJson(identity: LocalUserIdentity): {
  version: typeof localUserIdentityVersion;
  user_id: string;
  display_name: string;
  provisioned_at: string;
} {
  return {
    version: localUserIdentityVersion,
    user_id: identity.userId,
    display_name: identity.displayName,
    provisioned_at: identity.provisionedAt
  };
}

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
