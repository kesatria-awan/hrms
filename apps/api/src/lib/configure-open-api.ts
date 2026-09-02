import { Scalar } from "@scalar/hono-api-reference";

import type { AppOpenAPI } from "./types";

import packageJSON from "../../package.json" assert { type: "json" };
import { BASE_PATH } from "./constants";

const APP_VERSION = packageJSON.version;
const isBuildProduction = typeof process !== "undefined" && process.env.NODE_ENV === "production";
const scalarReferenceHandler = Scalar({
  // Theme and Layout
  theme: "kepler",
  layout: "classic",

  // OpenAPI Document Configuration
  url: `${BASE_PATH}/doc`,

  // HTTP Client Configuration
  defaultHttpClient: {
    targetKey: "js",
    clientKey: "fetch",
  },

  // UI/UX Enhancements
  expandAllResponses: false,
  expandAllModelSections: false,
  defaultOpenAllTags: false,
  showSidebar: true,

  // Meta Data
  metaData: {
    title: "Tracky API Reference",
    description: `API documentation for Tracky API v${APP_VERSION}`,
  },

  // Event Callbacks
  onLoaded: () => {
    // Optional: Add analytics or logging when API reference loads
  },
  onRequestSent: (_request) => {
    // Optional: Log API requests for debugging
  },
});

export default function configureOpenAPI(app: AppOpenAPI) {
  if (!isBuildProduction) {
    app.doc("/doc", {
      openapi: "3.0.0",
      info: {
        version: APP_VERSION,
        title: "Tracky API",
      },
    });
  } else {
    app.get("/doc", (c) => c.notFound());
  }

  app.get("/reference", async (c, next) => {
    if (c.env.NODE_ENV === "production") {
      return c.notFound();
    }
    return scalarReferenceHandler(c as any, next);
  });
}