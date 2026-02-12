# IlmQuest CI

This repository includes CI for `iteration1` using GitHub Actions.

## CI behavior
On every push to `main` and every pull request, CI will:
1. Install dependencies with `npm ci`
2. Start the app server on port `8880`
3. Wait for `http://localhost:8880/` to become reachable
4. Run:
   - `npm run security:test:csrf`
   - `npm run test:role-authorization`
   - `npm run test:tenant-isolation`
5. Always stop the server in cleanup

## Required GitHub Secrets
- `DB_STRING_TEST`: dedicated non-production MongoDB connection string for CI tests
- `SESSION_SECRET`: session secret used by test server in CI

Do not point `DB_STRING_TEST` to production.

## Run locally
```bash
cd iteration1
PORT=8880 DB_STRING=your_test_db_uri SESSION_SECRET=your_local_secret node backend/server.js
```

In a second terminal:
```bash
cd iteration1
npm run security:test:csrf
npm run test:role-authorization
npm run test:tenant-isolation
```
