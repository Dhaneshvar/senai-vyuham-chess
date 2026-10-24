# LineChess server

Run `npm install` and `npm start`. Default port: 3001. Set `PORT` for hosting; set `DATABASE_URL` for PostgreSQL persistence. `GET /health` reports storage and analysis queue status.

Socket.IO events: `game:create`, `game:join`, `game:move`, `game:resign`; the server broadcasts `game:state`. The server is authoritative for legal moves and clocks. Client tokens identify seats for reconnect; they are not user accounts or production-grade authentication.

HTTP analysis: `POST /analysis/position` accepts `{ "fen": "...", "depth": 11, "lines": 3 }`. `POST /analysis/review` accepts `{ "pgn": "..." }` and returns a job ID; poll `GET /analysis/review/:id`. Stockfish 19 lite runs in a serialized process queue, so long games can take time. Review jobs currently live in memory and are lost on restart.

Run `npm test` for the two-client multiplayer/reconnect and Stockfish integration test. For public hosting, add authentication, rate limiting, job persistence, monitoring, and capacity planning first.
