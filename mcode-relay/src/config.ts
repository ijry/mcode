import { z } from "zod"

const gatewayProviderSchema = z.enum(["official", "custom"])
const deploymentEnvSchema = z.enum(["development", "staging", "production"])

const booleanEnvSchema = z.preprocess((value) => {
  if (value === undefined || value === "") return undefined
  if (typeof value !== "string") return value
  const normalized = value.trim().toLowerCase()
  if (["true", "1", "yes", "on"].includes(normalized)) return true
  if (["false", "0", "no", "off"].includes(normalized)) return false
  return value
}, z.boolean())

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
  JWT_SECRET: z.string().default("dev-secret"),
  PAIRING_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 14),
  GATEWAY_NAME: z.string().trim().min(1).default("MCode Gateway"),
  PUBLIC_BASE_URL: z.string().trim().transform((value) => value.replace(/\/+$/, "")).default(""),
  GATEWAY_PROVIDER: gatewayProviderSchema.default("custom"),
  DEPLOYMENT_ENV: deploymentEnvSchema.default("development"),
  LOG_POLICY: z.string().trim().min(1).default("standard"),
  AUDIT_POLICY: z.string().trim().min(1).default("disabled"),
  AUDIT_EVENT_LIMIT: z.coerce.number().int().positive().max(100000).default(1000),
  AUDIT_WEBHOOK_URL: z.string().trim().default(""),
  AUDIT_WEBHOOK_SECRET: z.string().trim().default(""),
  AUDIT_WEBHOOK_TIMEOUT_MS: z.coerce.number().int().positive().max(60000).default(3000),
  ACCESS_POLICY: z.string().trim().min(1).default("allow-all"),
  ADMIN_TOKEN: z.string().trim().default(""),
  ADMIN_TOKEN_ROLES: z.string().trim().default(""),
  PAIRING_STORE_PATH: z.string().trim().default(""),
  REPLAY_STORE_PATH: z.string().trim().default(""),
  ALLOW_DEV_SECRETS: booleanEnvSchema.default(true),
})

export type RelayConfig = z.infer<typeof envSchema>

export function loadConfig(env: NodeJS.ProcessEnv = process.env): RelayConfig {
  return envSchema.parse(env)
}
