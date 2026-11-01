import { config as loadDotenv } from "dotenv";
import { z } from "zod";

import { ValidationError } from "../core/errors.js";

loadDotenv({ quiet: true });

const envSchema = z.object({
  LLM_API_KEY: z.string().optional(),
  LLM_BASE_URL: z.string().url(),
  LLM_MODEL: z.string().min(1),
  AGENT_A_PORT: z.coerce.number().int().min(1).max(65535).default(8001),
  AGENT_B_PORT: z.coerce.number().int().min(1).max(65535).default(8002),
  PACK_DIR: z.string().min(1).default("./pack"),
  OUTPUT_DIR: z.string().min(1).default("./output"),
  THRESHOLD_PCT: z.coerce.number().finite().default(15),
  LLM_CACHE_DIR: z.string().min(1).optional()
});

export type Env = z.infer<typeof envSchema>;
export type EnvOverrides = Partial<Record<keyof Env, string | number | undefined>>;

export function getEnv(overrides: EnvOverrides = {}): Env {
  const result = envSchema.safeParse({ ...process.env, ...overrides });
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    throw new ValidationError(`Invalid environment configuration: ${issues}`);
  }
  return result.data;
}