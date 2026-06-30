# QA Report — Users & Posts Full-Stack App

Date: 2026-06-30
Tester: qa

## Summary

| Suite / Check | Cases | Result |
|---|---|---|
| `tests/api/users.test.ts` (supertest, in-process against `src/api/app.ts`) | 7 | Pass |
| `tests/api/posts.test.ts` (supertest, in-process against `src/api/app.ts`) | 9 | Pass |
| `npm test` (full vitest run) | 16 | Pass (16/16) |
| Manual: `npm run dev` boots API (:3001) + Web (:3000) | - | Pass |
| Manual: `GET http://localhost:3000/` serves HTML page with title "Users & Posts App" | - | Pass |
| Manual: `GET http://localhost:3001/api/users` returns seed data directly | - | Pass |
| Manual: `GET http://localhost:3000/api/users` via Vite proxy | - | Pass |
| Manual: create user via `POST /api/users` (through proxy) | - | Pass |
| Manual: create post via `POST /api/posts` (through proxy) | - | Pass |
| Manual: `GET /api/posts?userId=` filter (through proxy) | - | Pass |
| Manual: validation failure returns 400 with error body | - | Pass |
| Visual UI verification in a real browser | - | Not performed by QA directly (curl-only); frontend-dev separately reported a manual browser pass |

### Detailed case coverage

**Users API**
- `GET /api/users` -> 200, array of seeded users
- `POST /api/users` success -> 201, returns created user with id
- `POST /api/users` missing fields -> 400 with `error`
- `GET /api/users/:id` found -> 200
- `GET /api/users/:id` not found -> 404
- `DELETE /api/users/:id` success -> 204, subsequent GET -> 404
- `DELETE /api/users/:id` unknown id -> 404

**Posts API**
- `GET /api/posts` -> 200, array of seeded posts
- `POST /api/posts` success -> 201, includes `createdAt`
- `POST /api/posts` missing fields -> 400
- `POST /api/posts` with non-existent `userId` -> 400
- `GET /api/posts/:id` found -> 200
- `GET /api/posts/:id` not found -> 404
- `GET /api/posts?userId=` filter -> 200, all returned posts match the filter
- `DELETE /api/posts/:id` success -> 204, subsequent GET -> 404
- `DELETE /api/posts/:id` unknown id -> 404

Not in the automated suite but exercised manually via curl through the Vite proxy (port 3000 -> 3001): create user, create post, filter by userId, validation 400. All behaved identically to direct-port calls.

## Bugs found

1. **`app.listen()` side effect on import (FIXED by backend-dev).**
   Originally `src/api/server.ts` called `app.listen(PORT)` at module load time. Importing it for supertest tests (`import app from "../../src/api/server.js"`) actually bound a real listener on port 3001, which threw `EADDRINUSE` whenever it collided with another instance (e.g., a second test file, or a real `npm run dev` already running). Flagged to backend-dev via message.

   **Fix:** backend-dev split the module into `src/api/app.ts` (builds/exports the Express app, no side effects) and `src/api/server.ts` (imports `app` and calls `.listen()` only when run directly). Tests were updated to import from `src/api/app.js`. Re-ran the full suite after the fix - 16/16 pass, no stray listeners, no `EADDRINUSE`. Confirmed working with the dev server simultaneously running on :3001 during manual testing (no conflict).

No other bugs found. No follow-up issues open with backend-dev or frontend-dev as of this report.

## End-to-end confirmation

The full app (API + UI) was started with `npm run dev` and confirmed running successfully:
- Vite web server on `http://localhost:3000`
- Express API on `http://localhost:3001`
- `/api/*` requests proxy correctly from the web origin to the API
- Create-user and create-post flows work end-to-end through the proxy (verified via curl, not a browser)

Frontend-dev separately reported (via message) running their own `npm run dev` pass with browser-level verification: page loads, seed data renders (3 users, 3 posts), and both create forms work and refresh the lists. QA's own verification was API/curl-based only - see Gaps.

The dev server was stopped after testing; no stray `vite`/`tsx` processes remain.

## Known gaps / untested areas

- **No browser-based visual verification was performed by QA.** All UI-flow confirmation on the QA side was done via curl against the proxy, not by rendering the page in a browser or using a DOM-testing tool (e.g., React Testing Library / Playwright). This repo has no component-level frontend tests. Frontend-dev did report a manual browser pass, but QA did not independently observe it.
- **No tests for `src/components/*.tsx`** (UserList, PostList, Card, Loading, ErrorMessage) or `App.tsx`. Adding React Testing Library coverage would be a reasonable next step if frontend test tooling (`@testing-library/react`, `jsdom`/`happy-dom`) is added to devDependencies.
- **No concurrency/race-condition testing** (e.g., simultaneous deletes, double-submission of forms).
- **No explicit test for cascading delete of posts when a user is deleted**, even though `src/api/routes/users.ts` implements this (deleting a user also removes their posts). Recommend adding a case asserting that a user's posts disappear from `GET /api/posts` after `DELETE /api/users/:id`.
- In-memory store means all state resets on server restart; not a bug, just a known limitation of the current architecture (no persistence layer).
