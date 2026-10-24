# Senai Vyuham

## License

Senai Vyuham's original code, branding, designs, artwork, and 3D assets are proprietary and all rights are reserved. They may not be copied, reused, redistributed, hosted, or modified without written permission. See [LICENSE](LICENSE). Third-party packages and assets remain under their respective licenses.

Senai Vyuham is an Expo/React Native and web chess app for Android, iOS, and browsers. Its central feature is the Analysis Lab: after a game, select a move, see Stockfish's suggested alternative, play that move in a separate what-if line, and continue against an engine reply or control both sides. The original game is never changed.

## What works

- Pass-and-play with legal move highlights, captures, promotion choice, check/checkmate/draw detection, flip board, original SVG pieces, three board themes, sounds, haptics, untimed and timed games.
- Two-player online rooms via Socket.IO. The Node server validates moves, owns clocks, handles reconnect tokens, and can persist games in PostgreSQL.
- On-device history in SQLite and move-by-move Stockfish 19 analysis from the server, including top lines, board arrows, evaluation, and a what-if branch.
- A procedural 3D board for live games and a camera-overlay preview. The camera view is **not surface-tracked AR**: it has no plane detection or world anchoring. VR is not implemented.

Engine “chance” is a heuristic transformation of the evaluation, not a calibrated prediction or guarantee of winning. Move-quality labels use heuristic thresholds. Stockfish analysis runs on the server and needs a connection; local pass-and-play does not.

## Run locally on a phone

Requirements: Node.js, npm, Android or iOS phone, and the laptop and phone on the same Wi-Fi network.

```powershell
npm install
cd server
npm install
npm start
```

In a second terminal at the project root:

```powershell
npx expo start --lan
```

Open the QR code in Expo Go or a development build. In the app's Settings, enter `http://YOUR_LAPTOP_WIFI_IP:3001` and tap **Save and test connection**. `localhost` on a phone means the phone, not your laptop. Allow Node through the laptop firewall on the private network if needed. For testing from different networks, deploy the server to a reachable HTTPS host and use its `https://` address.

You can also set `EXPO_PUBLIC_API_URL` in a local `.env` file before starting Expo. This URL is bundled into the client and is not secret.

## How multiplayer works

The mobile app opens a long-lived Socket.IO connection (which normally uses WebSocket). The host creates a room; the server returns an eight-character code and assigns a color. A second phone sends that code to join. Each move goes to the server, which checks whose turn it is, validates the move with `chess.js`, advances its own clock, and broadcasts the official new position to both phones. On reconnect, the app presents a saved random token to reclaim its seat. A server is required for internet multiplayer: your laptop can serve local tests, but it is not an always-on public service. One server handles many rooms; scaling further needs deployment, capacity tests, shared room state, and operational controls.

The server uses in-memory rooms by default. Set `DATABASE_URL` to a PostgreSQL connection string to persist game state across restarts. Analysis jobs are currently kept in memory, and a single process queues Stockfish work. Do not expose this server publicly without authentication, abuse controls, monitoring, and an appropriate privacy policy.

## Project structure

- `src/app/`: Expo Router screens.
- `src/state/`: game/socket/session state.
- `src/ui/`: 2D and 3D board, pieces, theme, controls.
- `src/lib/`: API, local storage, shared client types.
- `server/src/`: authoritative realtime server, PostgreSQL adapter, Stockfish queue.
- `server/test/`: end-to-end two-client and engine tests.
- `scripts/generate-sounds.mjs`: regenerates the original board sound assets.

## Check and build

```powershell
npx tsc --noEmit
npx eslint src --ext .ts,.tsx
npx expo-doctor
npx expo export --platform android
cd server
npm test
```

`eas.json` includes development, preview, and production profiles. To create signed binaries after configuring your Expo account and credentials, use `npx eas-cli@latest build --profile preview --platform android` or the corresponding production/iOS profile. Store publication also needs final device QA, privacy disclosures, signing, listing assets, and developer accounts.

For a full handoff checklist, see [`docs/PLAY_STORE_RELEASE_CHECKLIST.md`](./docs/PLAY_STORE_RELEASE_CHECKLIST.md). The public privacy policy must be completed and hosted before Play Console submission; a release-ready template is in [`docs/PRIVACY_POLICY.md`](./docs/PRIVACY_POLICY.md).

## GitHub and web deployment

This repository is ready for GitHub Actions and either Render or Railway. See [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) for the required environment variables, GitHub push steps, and production deployment instructions.
Run the release security checks in [`docs/SECURITY.md`](./docs/SECURITY.md) before exposing the server publicly.

## Remaining phase-six work

True floor-anchored AR and VR require a compatible native AR framework, device capability checks, and physical-device tests. The current camera view is deliberately labeled as a preview. The procedural 3D mode also needs device performance/interaction QA and art polish before release. The iOS binary cannot be validated on this Windows workstation without an iOS device/cloud build.
