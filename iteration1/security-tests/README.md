# Security Tests

## CSRF attack simulation

This test suite validates that sensitive dashboard/auth mutation endpoints reject requests missing a CSRF token.

Run with the app already running:

```bash
cd iteration1
npm run security:test:csrf
```

Optional target base URL:

```bash
SECURITY_TEST_BASE_URL=http://localhost:3000 npm run security:test:csrf
```
