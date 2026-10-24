# LineChess Play Store release checklist

This repository is ready for a **release candidate**, not a completed Play Store publication. Complete every item below before pressing Submit in Google Play Console.

## Required external setup

- Create or use the developer's Google Play Console account and pay any applicable registration fee.
- Confirm `com.senaivyuham.app` is an available and owned Android application ID. Do not change it after publishing.
- Host [`PRIVACY_POLICY.md`](./PRIVACY_POLICY.md) at a stable public HTTPS URL; add developer legal name, country, and monitored support email first.
- Deploy the Node service behind HTTPS/WSS with `DATABASE_URL`, `CORS_ORIGINS`, and `TRUST_PROXY=true` only when a trusted reverse proxy is actually configured.
- Create database backups, retention/deletion procedures, uptime monitoring, error logging, and a support contact.
- Configure EAS credentials under the developer's Expo account; never commit keystores, service accounts, or `.env` secrets.

## Google Play listing and declarations

- Create the store listing: short description, full description, category (Board), support email, privacy-policy URL, icon, feature graphic, and truthful phone/tablet screenshots.
- Complete the Data safety form based on the deployed server configuration. The current app has local game data and optional server processing for online play/analysis; camera images are not stored or transmitted by the app.
- Complete the content rating questionnaire truthfully. Chess is normally suitable for all ages, but answer based on the final released feature set.
- Complete the ads declaration (the current app has no ads), app access declaration (no account is required), target audience declaration, and permissions declaration for camera access.
- Verify current Google Play target API requirements immediately before build submission; store requirements can change after this document was written.

## Release build and QA

- Increase `expo.version` and `android.versionCode` for every Play upload. `versionCode` must always increase.
- Create an Android App Bundle with `npx eas-cli@latest build --profile production --platform android` and upload it first to Internal testing.
- Test a signed internal build on several physical Android devices: cold start, rotation/back gesture, offline state, local game, clocks, promotion, sounds/haptics, full online game, reconnect, analysis, data deletion, and denied camera permission.
- Confirm analysis can tolerate a slow/offline server, a game completes, and the app remains usable on small screens and accessibility font sizes.
- Test the production service under expected load. The current single-process Stockfish queue is appropriate for an initial controlled release only; increase worker capacity before a large public launch.
- Use closed testing before production, review Android vitals/crashes, then stage the production rollout.

## Not claims for the current version

- Camera view is a manual overlay preview, not floor-anchored AR.
- VR is not included.
- The app has no sign-in, matchmaking, ratings, notifications, payments, or chat moderation.
