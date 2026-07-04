# Athena's OS — Ship Checklist

You are running the full pre-deploy validation for Athena's Decor OS. Work through every gate below in order. Stop and report the first failure — do not skip ahead. At the end, print a pass/fail summary table.

---

## Gate 1 — Tests

Run the full test suite from the repo root (where `package.json` lives):

```bash
cd /home/user/Athena-s-Decor-OS && pnpm test 2>&1
```

If this fails, diagnose the failure, fix the root cause, and re-run before continuing.

---

## Gate 2 — TypeScript

Run the type-checker with zero tolerance:

```bash
cd /home/user/Athena-s-Decor-OS && npx tsc --noEmit 2>&1
```

Fix every type error before continuing. Do not suppress errors with `// @ts-ignore` unless you explain why it is the only option.

---

## Gate 3 — Migration Integrity

Check that every schema change has a matching migration file:

1. Count SQL files in `drizzle/` — there should be a contiguous sequence starting at `0000_`.
2. Grep for any table name in `drizzle/schema.ts` that does NOT appear in any `drizzle/*.sql` file — those are unmigrated tables.
3. Confirm `server/_core/index.ts` still calls `runMigrations()` before `seedDefaultSettings()`.

Report any gaps found.

---

## Gate 4 — Code Rules (handoff doc enforcement)

Scan the diff of the current branch vs main for violations of these four rules:

### Rule A — protectedProcedure
Every tRPC mutation that touches user data or credentials MUST use `protectedProcedure`, not `publicProcedure`.

```bash
grep -rn "publicProcedure\.mutation" server/routers.ts | head -30
```

Flag any line that writes to the DB or reads credentials.

### Rule B — Zod on mutations
Every `.mutation()` call MUST have a `.input(z.object({...}))` schema. No unvalidated mutations.

```bash
grep -A3 "\.mutation(" server/routers.ts | grep -v "\.input(" | grep -v "^--$" | head -30
```

Flag any mutation missing an `.input()` call on the next line.

### Rule C — Encrypted credentials
Credentials stored in the `sourcingAppCredentials`, `shopifyConfig`, or `integrationTokens` tables MUST be encrypted via `server/crypto.ts` before insert. Check that `encrypt()` is called before `upsertSourcingAppCredential`, `upsertShopifyConfig`, and `upsertIntegrationToken`.

```bash
grep -n "upsertSourcingAppCredential\|upsertShopifyConfig\|upsertIntegrationToken" server/routers.ts | head -20
```

For each match, look 10 lines above and confirm `encrypt(` appears.

### Rule D — Key masking
Any tRPC query that returns credentials (API keys, tokens, passwords) MUST mask the value before sending to the client. Acceptable masks: replace with `"••••••" + last4`, or omit the field entirely.

```bash
grep -n "accessToken\|apiKey\|password\|secret" server/routers.ts | grep -i "return\|select\|pick" | head -20
```

Flag any line that returns a raw credential string to the client.

---

## Gate 5 — Railway Deploy Verify

1. Fetch the latest Railway deployment status by hitting the health endpoint:

```bash
curl -sf https://athena-s-decor-os-production.up.railway.app/api/health && echo "LIVE" || echo "DOWN"
```

2. Confirm the response is `{"status":"ok"}`.

3. If DOWN: check Railway logs (remind the user: Railway → web service → Deployments → latest → View Logs).

---

## Final Summary

Print this table filled in with PASS / FAIL / WARN:

| Gate | Check | Result | Notes |
|------|-------|--------|-------|
| 1 | pnpm test | | |
| 2 | tsc --noEmit | | |
| 3 | Migration integrity | | |
| 4A | protectedProcedure | | |
| 4B | Zod on mutations | | |
| 4C | Encrypted credentials | | |
| 4D | Key masking | | |
| 5 | Railway health | | |

**Only mark the build as ship-ready if all gates are PASS or WARN (no FAIL).**
