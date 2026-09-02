import configureOpenAPI from "@/api/lib/configure-open-api";
import createApp from "@/api/lib/create-app";
import { registerRoutes } from "@/api/routes";

import type { AppEnv } from "./lib/types";

import { handleScheduled } from "./scheduled";

const app = registerRoutes(createApp());
configureOpenAPI(app);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: AppEnv["Bindings"], ctx: ExecutionContext) {
    ctx.waitUntil(handleScheduled(env));
  },
};
