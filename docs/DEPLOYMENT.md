# Senai Vyuham deployment

## Before the first push

1. Copy `server/.env.example` to `server/.env` only for local development. Never commit it.
2. Copy `web/.env.example` to `web/.env` only when testing a hosted backend locally.
3. Keep real production values in Render or Railway variables, not in GitHub.
4. Run the checks from the repository root:

```powershell
npx tsc --noEmit
cd server; npm test
cd ../web; npm run build
```

## GitHub

Create an empty GitHub repository, then add it as the `origin` remote and push the current branch:

```powershell
git remote add origin https://github.com/YOUR_ACCOUNT/senai-vyuham.git
git branch -M main
git add .
git commit -m "Prepare Senai Vyuham for deployment"
git push -u origin main
```

GitHub Actions then verifies the mobile typecheck/lint, server tests, and the Vite production build on each push and pull request.

## Render

The root `render.yaml` Blueprint creates:

- `senai-vyuham-web`: Vite static site from `web/dist`.
- `senai-vyuham-api`: Node, Socket.IO, and Stockfish service from `server`.
- `senai-vyuham-db`: PostgreSQL storage.

In Render, choose **New → Blueprint**, connect the GitHub repository, and select `render.yaml`.

After the static site has a URL or custom domain, set this API service variable:

```text
CORS_ORIGINS=https://YOUR_WEB_DOMAIN
```

Then set this static-site build variable and redeploy the web service:

```text
VITE_API_URL=https://YOUR_API_DOMAIN
```

For the mobile app, set `EXPO_PUBLIC_API_URL=https://YOUR_API_DOMAIN` in the EAS environment or before building the app.

## Railway

Create one Railway project with three services:

| Service | Root directory | Build | Start / publish |
| --- | --- | --- | --- |
| API | `/server` | `npm ci` | `npm start`, health check `/health` |
| Web | `/web` | `npm ci && npm run build` | Serve `dist` as a static site |
| PostgreSQL | managed plugin | — | — |

API variables:

```text
NODE_ENV=production
TRUST_PROXY=true
DATABASE_URL=${{Postgres.DATABASE_URL}}
CORS_ORIGINS=https://YOUR_WEB_DOMAIN
```

Web build variable:

```text
VITE_API_URL=https://YOUR_API_DOMAIN
```

Generate public domains for both services. Use HTTPS for API requests and WSS for Socket.IO automatically via the HTTPS API URL.

## Production checklist

- Use a paid, always-on API service before inviting public multiplayer traffic; sleeping instances interrupt game sockets and Stockfish reviews.
- Put API and PostgreSQL in the same region, preferably near the first user base.
- Keep `CORS_ORIGINS` restricted to the real web domain.
- Add a custom domain before sharing broadly.
- Monitor `/health`, deploy logs, memory, CPU, WebSocket reconnects, and analysis queue length.
- The current multiplayer state and review jobs are process-memory based between snapshots. Add Redis/pub-sub before scaling the API beyond one instance.
