import configureOpenAPI from "@/api/lib/configure-open-api";
import createApp from "@/api/lib/create-app";
import { registerRoutes } from "@/api/routes";

const app = registerRoutes(createApp());
configureOpenAPI(app);

export default {
  fetch: app.fetch,
};