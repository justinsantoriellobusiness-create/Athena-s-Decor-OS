# Build Summary — Users & Posts Full-Stack App

## What was built

A full-stack Users & Posts app in `fullstack-app/`:

- **REST API** (`src/api/`): Express + TypeScript, in-memory store, routes for users and posts (CRUD, plus filtering posts by `userId`). Seeded with 3 users and 3 posts on startup.
- **React frontend** (`src/components/`): React 18 UI listing users and posts, with forms to create new users and new posts (with author selection).
- **Tests** (`tests/`): Vitest + Supertest integration tests covering both APIs (success paths, validation errors, 404s, deletes, filtering) — 16/16 passing. Results documented in `tests/report.md`.

Built by a 3-agent team (Backend Dev, Frontend Dev, QA) coordinating via direct messages: Backend Dev built and published the API contract, Frontend Dev wired up the UI against it, and QA wrote tests and caught/drove the fix for a real bug (see below).

## Key decisions

- **Isolated `fullstack-app/` directory**: the repo's existing top-level `vite.config.ts` pointed at a `client/` directory that doesn't exist (leftover from an unrelated template). Rather than repair or fight that config, the whole app lives in its own `fullstack-app/` with its own `package.json`, `vite.config.ts`, `tsconfig.json`, and `index.html` — fully self-contained and decoupled from the rest of the repo.
- **Vite dev proxy** (`vite.config.ts`): `/api/*` requests from the Vite dev server (port 3000) are proxied to the Express API (port 3001). This lets the frontend use simple relative fetch paths and avoids CORS configuration in development.
- **In-memory data store**: no database — simplest option for a demo app with seeded sample data. Data resets on server restart.
- **`app.ts` / `server.ts` split**: the Express app is built and exported with no side effects in `app.ts`; only `server.ts` calls `.listen()`. This was a fix driven by QA, who found that importing the original `server.ts` directly in tests bound a real port listener and caused `EADDRINUSE` failures. Splitting these let Supertest exercise the app in-process without binding a port.

## How to run it

```bash
cd fullstack-app
npm install
npm run dev
```

This starts both the API (port 3001) and the Vite dev server (port 3000) concurrently. Visit **http://localhost:3000** to use the app.

To run tests:

```bash
cd fullstack-app
npm test
```

See `tests/report.md` for the latest test results.
