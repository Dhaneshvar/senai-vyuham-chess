# Senai Vyuham Web - React + Vite

This is a separate React browser app. It does not modify the Expo/React Native mobile app.

## Start locally

First start the existing backend in one terminal:

```powershell
cd ..\server
npm start
```

Then run this React web application in a second terminal:

```powershell
cd ..\web
npm install
npm run dev
```

Open the local URL Vite prints, normally `http://localhost:5173`. In Online room mode, use `http://localhost:3001` as the game server.

## Browser/mobile multiplayer

Both clients use the same Socket.IO events. Create a room in the browser and join its code from the mobile app, or create a room on the mobile app and join it in the browser.

## Production

Build the static website with `npm run build`. Deploy `web/dist` to an HTTPS static host, deploy `server/` separately behind HTTPS/WSS, and configure `CORS_ORIGINS=https://your-web-domain.example` on the server. Do not put private keys in this browser application.
