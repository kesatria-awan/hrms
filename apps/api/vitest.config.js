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
                        bindings: { TEST_MIGRATIONS: migrations },
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
