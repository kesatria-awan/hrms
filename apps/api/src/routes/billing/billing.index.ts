import createRouter from "@/api/lib/create-router";

import * as handlers from "./billing.handlers";
import * as routes from "./billing.routes";

const billingRoutes = createRouter()
  .openapi(routes.createCheckout, handlers.createCheckoutHandler)
  .openapi(routes.cancelSubscription, handlers.cancelSubscriptionHandler)
  .openapi(routes.getBillingStatus, handlers.getBillingStatusHandler);

export default billingRoutes;
export type BillingRoutesType = typeof billingRoutes;
