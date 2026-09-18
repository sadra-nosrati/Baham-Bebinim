# Baham Bebinim — Code Structure

The project keeps the runtime intentionally small, but the high-risk concerns are separated so they can be tested and changed without editing the whole watch-room UI.

## Client

- `components/WatchRoom.js` — room orchestration and UI state.
- `lib/mediaQuality.js` — HLS quality detection and immediate quality switching.
- `lib/chatMedia.js` — chat-media limits, MIME detection, chunked image upload and user-facing upload errors.
- `lib/socketAck.js` — Promise-based Socket.IO acknowledgement timeout handling.

## Server

- `server.js` — HTTP/Socket.IO orchestration, room state and permissions.
- `server/quality.js` — normalized quality modes and direct-source selection.
- `server/chunkedImageUploads.js` — bounded, expiring in-memory image upload sessions.

## Lifecycle rules

- Room video state is ephemeral once the last member leaves.
- Personal saved videos are separate from room state and remain long-lived.
- Camera/gallery images are accepted up to 3 MB but transferred in small chunks to work safely behind reverse-proxy request-size limits.
- Host/admin quality changes are broadcast as a dedicated event so HLS clients switch immediately.
- A `pagehide` beacon notifies the server when a browser leaves, reducing the delay before an empty room is destroyed.

## Security / resource boundaries

- Node binds to localhost by default and is expected to stay behind Nginx.
- Upload size, pending upload memory, room count, member count and Socket.IO message size are bounded.
- Upload sessions expire automatically and are aborted when a member leaves.
- Client operations with visible loading states use acknowledgement timeouts; they cannot spin forever waiting for a missing callback.
