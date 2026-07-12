export const COOKIE_NAME = "app_session_id";
// Below this, CJ order placement starts failing outright — shared by the
// Fulfillment page's UI warning and the background proactive alert so they
// can never drift apart.
export const CJ_LOW_BALANCE_THRESHOLD = 20;
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
