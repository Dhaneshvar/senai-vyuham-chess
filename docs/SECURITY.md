# Security checklist

This is the minimum security gate for changes to Senai Vyuham and future deployments.

## Before every release

- Run `npm audit --audit-level=high` in the root, `server`, and `web` projects. Review every exception instead of blindly accepting it.
- Run `npx tsc --noEmit`, `npm test` in `server`, and `npm run build` in `web`.
- Run `git diff --check` and verify that no `.env`, private key, database URL, token, or production credential is staged.
- Keep `CORS_ORIGINS` restricted to the real HTTPS web origins. Never use `*` or leave it unset in production.
- Keep the API behind HTTPS/WSS and configure `TRUST_PROXY` only when the provider's proxy is the only public path to the service.

## Application controls

- The server is authoritative for legal moves, turns, clocks, and results. Never trust a client-provided game state.
- Validate and bound every HTTP body, Socket.IO payload, name, PGN, FEN, clock, and analysis option before using it.
- Keep rate limits and capacity limits enabled. If analysis needs to scale, move jobs to a durable queue with authenticated users and per-user quotas.
- Treat reconnect tokens as bearer credentials: do not log them, expose them in URLs, or persist them in client telemetry. Rotate them if account authentication is added.
- Do not return stack traces or database errors to clients. Keep detailed errors in server-side logs with redaction.
- Keep PostgreSQL private, use TLS where the provider requires it, and grant the application only the minimum database privileges.

## Deployment review

- Set `NODE_ENV=production`, a narrow `CORS_ORIGINS`, a production `DATABASE_URL`, and HTTPS custom domains before launch.
- Confirm the static host sends the security headers in `render.yaml` (or equivalent headers on another provider).
- Add provider monitoring, log retention, backups, and an alert for `/health` failures and analysis queue saturation.
- Re-test room creation, reconnect, analysis, and draw/resign flows after every proxy or domain change.

This checklist is project guidance; it is not a substitute for an independent penetration test before handling real user accounts or payments.
