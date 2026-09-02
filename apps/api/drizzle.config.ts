import { defineConfig } from "drizzle-kit";

// only used to create migrations
// we use wrangler to apply migrations (see package.json)
export default defineConfig({
  out: "./src/db/migrations",
  schema: "./src/db/schema/index.ts",
  dialect: "sqlite",
});
