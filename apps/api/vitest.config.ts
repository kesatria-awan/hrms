import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineWorkersConfig(async () => {
  const migrationsPath = path.join(__dirname, "src", "db", "migrations");
  const migrations = await readD1Migrations(migrationsPath);

  return {
    test: {
      poolOptions: {
        workers: {
          isolatedStorage: true,
          wrangler: {
            configPath: "./wrangler.jsonc",
          },
          miniflare: {
            bindings: {
              TEST_MIGRATIONS: migrations,
              JWT_SECRET: "test-jwt-secret-minimum-32-characters-long",
              BREVO_API_KEY: "test-brevo-key",
              BREVO_WEBHOOK_SECRET: "test-webhook-secret",
              GOOGLE_CLIENT_ID: "test-google-client-id",
              GOOGLE_CLIENT_SECRET: "test-google-secret",
            },
            r2Buckets: ["R2_BUCKET"],
          },
        },
      },
    },
    resolve: {
      alias: {
        "@/api": path.resolve(__dirname, "./src"),
      },
    },
  };
});
