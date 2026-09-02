import { notFound, onError } from "stoker/middlewares";

import type { AppOpenAPI } from "./types";

import { pinoLogger } from "@/api/middlewares/pino-logger";
import { BASE_PATH } from "@/api/lib/constants";
import createRouter from "@/api/lib/create-router";

export default function createApp() {
  const app = createRouter()
    .use("*", async (c, next) => {
      if (c.req.path.startsWith(BASE_PATH)) {
        return next();
      }

      // Try to serve the requested asset first, then fall back to index.html for SPA routes
      const assetResponse = await c.env.ASSETS.fetch(c.req.raw);
      if (assetResponse.status !== 404 || c.req.method !== "GET") {
        return assetResponse;
      }

      const requestUrl = new URL(c.req.raw.url);
      const indexRequest = new Request(new URL("/index.html", requestUrl).toString(), {
        headers: c.req.raw.headers,
        method: "GET",
      });
      return c.env.ASSETS.fetch(indexRequest);
    })
    .basePath(BASE_PATH) as AppOpenAPI;

  app.use(pinoLogger());
  app.notFound(notFound);
  app.onError(onError);

  return app;
}

export function createTestApp<R extends AppOpenAPI>(router: R) {
  return createApp().route("/", router);
}
