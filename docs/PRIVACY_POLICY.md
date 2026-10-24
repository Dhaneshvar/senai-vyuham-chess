# LineChess Privacy Policy

**Effective date: October 18, 2026**

This policy describes how LineChess handles information when you use the mobile app and the LineChess game service.

## Information processed

LineChess stores completed-game PGN, game result, board preferences, server address, and an anonymous reconnect token locally on the device. If you use online play or engine analysis, the game position, moves, display name, room code, and anonymous reconnect token are sent to the game server that you configure.

The public hosted service may temporarily process this data to provide real-time games and analysis. When PostgreSQL storage is enabled, game state can be retained after a service restart. The app does not require an account, request contacts, collect precise location, or include advertising or third-party analytics SDKs.

## Camera

Camera access is requested only when the user opens Camera view in Immersive mode. The current app shows a live preview only. It does not record, upload, or save camera images.

## Sharing

LineChess uses the phone's system share sheet only when the user chooses to share an online room code. The app does not sell personal information or use it for cross-app advertising.

## Retention and deletion

Users can erase local game history, preferences, and their reconnect token from Settings → Erase on-device data. A public hosted service must provide a working support email and a deletion-request method before this policy is published. Configure retention and deletion controls on the production database before launch.

## Security

LineChess uses HTTPS and WSS in production. The service rate-limits room and analysis requests, but no online service can guarantee absolute security. Do not put sensitive personal information in display names or room codes.

## Contact

Before publication, replace this section with the developer's legal name, support email address, country, and a public contact URL. Host this exact policy at a stable public HTTPS URL and put that URL in Google Play Console.

## Changes

This policy may be updated for legal, operational, or product changes. The effective date at the top will be updated when it changes.
