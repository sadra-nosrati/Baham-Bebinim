# Baham Bebinim — Code Structure

The project keeps the runtime intentionally small, but the high-risk concerns are separated so they can be tested and changed without editing the whole watch-room UI.

## Client

- `components/WatchRoom.js` — room orchestration and UI state.
- `lib/mediaQuality.js` — HLS quality detection and immediate quality switching.
- `lib/chatMedia.js` — chat-media limits, image signature detection, bounded chunked image/voice upload and user-facing upload errors.
- `lib/privateRoomCrypto.js` — browser-only AES-256-GCM key handling and chat/media encryption helpers.
- `components/chat/MediaGallery.js` — derived media view over existing messages; no duplicate server index.
- `components/chat/EncryptedMedia.js` — lazy client-side fetch/decrypt for private image/voice media.
- `lib/socketAck.js` — Promise-based Socket.IO acknowledgement timeout handling.

## Server

- `server.js` — HTTP/Socket.IO orchestration, room state and permissions.
- `server/quality.js` — normalized quality modes and direct-source selection.
- `server/chunkedImageUploads.js` — generic bounded, expiring in-memory upload sessions used by image and voice transfers.
- `server/imageValidation.js` — server-side image signature detection for public uploads.

## Lifecycle rules

- Room video state is ephemeral once the last member leaves.
- Personal saved videos are separate from room state and remain long-lived.
- Camera/gallery images are accepted up to 5 MiB, validated from their actual file signature, and transferred in small chunks to work safely behind reverse-proxy request-size limits. Voice uploads use the same bounded chunk transport instead of one large polling body.
- Private rooms encrypt chat text/image/voice content in the browser with AES-256-GCM. The content key lives in the URL fragment/local browser storage and is never included in Socket.IO/HTTP payloads. Enabling private mode from a public room rotates to a fresh content key; disabling it removes the saved key from that browser.
- The chat media gallery is a derived client view of existing messages; it creates no duplicate server index or media copy. Encrypted images are lazy-fetched/decrypted near the viewport and encrypted voice files require an explicit tap before download/decryption.
- Host/admin quality changes are broadcast as a dedicated event so HLS clients switch immediately. Already-resolved provider source lists are reused for direct multi-quality sources, avoiding an unnecessary provider API request on each quality click.
- A `pagehide` beacon notifies the server when a browser leaves, reducing the delay before an empty room is destroyed.

## Security / resource boundaries

- Node binds to localhost by default and is expected to stay behind Nginx.
- Upload size, pending upload memory, room count, member count and Socket.IO message size are bounded.
- Upload sessions expire automatically and are aborted when a member leaves.
- Client operations with visible loading states use acknowledgement timeouts; they cannot spin forever waiting for a missing callback.
