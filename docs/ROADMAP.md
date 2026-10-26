# Senai Vyuham roadmap

This document records planned work only. Items here are not yet available to players.

## Online room communication

- Session-only live text chat between the two players in a private room.
- Optional opponent voice chat using WebRTC, muted by default and enabled only after a player grants microphone permission.
- Voice is peer-to-peer where possible and is not recorded or stored by Senai Vyuham.
- Chat messages should exist only for the active room and be cleared when the room ends, both players leave, or the room expires. They must not be written to PostgreSQL unless a future, explicitly announced retention policy is added.
- Before release, add HTTPS/WSS-only transport, Socket.IO signaling validation, message size and rate limits, room membership checks, a TURN relay for restrictive mobile/Wi-Fi networks, and report/block or moderation controls.

## Product direction

- AI coach and arbiter guidance.
- Chess960, rapid/blitz controls, and tournaments.
- Continued 3D performance and device-quality improvements.
