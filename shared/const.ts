export const COOKIE_NAME = "app_session_id";
// Below this, CJ order placement starts failing outright — shared by the
// Fulfillment page's UI warning and the background proactive alert so they
// can never drift apart.
export const CJ_LOW_BALANCE_THRESHOLD = 20;
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/**
 * Where the Fulfillment page's DSers button sends you.
 *
 * DSers has no merchant-facing order API — their public APIs are for building
 * channel/supplier apps that plug into DSers, not for a merchant to place
 * their own orders — so the order genuinely has to be actioned in DSers' own
 * UI. This is the closest thing to one-button fulfillment: the button copies
 * the order number and opens DSers, so it's click → paste → place.
 *
 * This is the DSers root because no per-order deep-link format is published
 * and a guessed path would 404, which is worse than landing on the dashboard.
 * To make it a direct jump: open your DSers open-orders page, copy the URL
 * from the address bar, and paste it here — this constant is the only place
 * it's referenced.
 */
export const DSERS_ORDER_URL = "https://www.dsers.com/";
