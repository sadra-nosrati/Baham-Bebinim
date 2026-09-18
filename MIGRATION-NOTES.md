# Migration Notes — 2.1 Mobile Web App

## تغییرات این نسخه

- پشتیبانی از لینک معمولی صفحه ویدیو Aparat با resolve سمت سرور
- حفظ لینک مستقیم MP4/WebM/M3U8
- حذف emoji از آیکن‌های رابط و جایگزینی با SVG inline
- بازطراحی کامل پلیر برای لمس و موبایل
- Play/Pause با کلیک روی خود ویدیو برای Host
- کنترل Volume به صورت popover لمسی و fallback مخصوص iPhone
- Fullscreen fallback برای iOS
- Chat Bottom Sheet در Portrait
- Chat overlay در Landscape
- حذف اسکرول صفحه تماشا
- مخفی کردن scrollbarهای native سفید
- Emoji tray و reaction picker به شکل grid بدون horizontal scroll
- Host source editor به شکل modal روی موبایل
- اصلاح npm scripts برای Windows PowerShell

## فایل‌های اصلی تغییرکرده

- `server.js`
- `components/WatchRoom.js`
- `app/globals.css`
- `app/page.js`
- `package.json`

نسخه قدیمی همچنان در `legacy-original` باقی مانده است.

## v2.3 fixes
- Mobile portrait chat height reduced to preserve the movie view.
- Landscape phone chat moved to a compact left-side companion panel.
- Removed emoji glyphs that commonly render as empty tofu boxes on older devices.
- Viewer controls now fill the former playback-rate gap with a sync action on desktop; mobile uses a five-control row.
- Home form button aligned with its inputs; room-code placeholder now shows an example.
- Removed SSR random room code generation to avoid hydration differences.
- Added root hydration suppression for browser extensions that inject body attributes (e.g. `cz-shortcut-listen`).
- Socket.IO client no longer forces WebSocket as the first transport.
- Disabled React Strict Mode in this custom realtime dev server to avoid duplicate dev connect/disconnect noise.
- Added favicon assets.

## v2.4
UI-only interaction polish. Playback room sync protocol was not changed. Chat scrolling is now contained to the messages viewport and fullscreen targets the watch shell so mobile companion chat can remain part of the fullscreen DOM.


## v2.5 — Custom room roles
- Added host-only reusable room roles and member assignment.
- Role badges appear in member list and chat.
- Role changes broadcast through the existing room state without modifying playback synchronization.
- Role assignments survive normal Socket.IO reconnects in the same browser while the room remains alive.


## v2.6
- Role metadata now includes a server-validated color and emoji preset.
- Mobile chat no longer stretches when empty; its message viewport is capped to roughly four compact message rows so video remains the primary surface.


## v2.7 sync + mobile chat patch
- Mobile chat trigger is always available, even before playback starts or while autoplay gesture is pending.
- Added server clock calibration to avoid device clock differences affecting playback sync.
- Host sends a calibrated playback snapshot every ~750ms while playing.
- Host-to-server and server-to-viewer transit time is compensated.
- Small drift is corrected smoothly; larger drift is corrected immediately.
- Primary play button hover keeps its light visual style.


## v2.8 — Viewer playback requests
- مهمان‌ها دیگر Play/Pause مستقیم ندارند و یک کنترل درخواست به میزبان می‌بینند.
- مهمان می‌تواند درخواست Pause یا Play بفرستد؛ کنترل واقعی همچنان فقط دست میزبان است.
- Cooldown درخواست 60 ثانیه است و سمت سرور بر اساس clientKey اتاق enforce می‌شود تا با reconnect دور زده نشود.
- میزبان اعلان درخواست با گزینه «انجام بده» دریافت می‌کند؛ اجرای درخواست از سمت میزبان از همان مسیر Sync موجود پخش می‌شود.


## v2.9
- Fixed mobile room entry robustness (immediate join, storage fallback, uppercase room normalization).
- Playback request cooldown reduced from 60s to 10s on both client fallback and server authority.
- Added host-only room:clear-video event and UI actions; clears media source and playback state for all members.
- Reduced mobile chat footprint to roughly three simultaneous compact messages.


## v3.0 — Video Suggestions
- Viewer video suggestion queue added.
- Any valid HTTP/HTTPS URL can be submitted for host review.
- Host can inspect, accept, or reject suggestions.
- Suggestions are capped and server-side rate limited.
- Existing playback/sync/chat/roles behavior is unchanged.
- Arbitrary webpage URLs are accepted as suggestions, but actual in-player playback still depends on the site exposing a browser-playable/direct media source.

## v3.1 — Mobile fullscreen & keyboard UX
- Fullscreen hides the main room header and keeps the movie surface full-height.
- On supported mobile browsers, entering fullscreen requests landscape orientation; unsupported browsers fall back safely.
- Fullscreen player chrome auto-hides after 5 seconds and returns on the next tap/mouse movement.
- The first tap while controls are hidden only reveals controls; it does not accidentally pause/play the movie.
- Chat uses Visual Viewport measurements so the composer stays above the mobile software keyboard.
- Chat input disables browser autofill/password-manager hints as far as web standards allow.


## v3.2
- Mobile landscape: persistent chat/reaction shortcuts while fullscreen player controls auto-hide.
- Mobile landscape chat height tracks the visible viewport and remains keyboard-safe.
- Portrait chat composer docks directly above the software keyboard with reduced gap.
- Room-code canonicalization now normalizes Persian/Arabic digits and supports Unicode letters/numbers consistently across landing, client join, and server.
- No playback sync/socket protocol behavior was changed.


## v3.3 — Persistent mobile chat/reaction shortcuts
- On mobile portrait and landscape, chat and reaction shortcuts on the video never follow fullscreen control auto-hide.
- The shortcuts stay visible in normal, native fullscreen and pseudo-fullscreen modes.
- No playback, sync, room, chat or socket logic changed.

### v3.4
- Added room:probe and host-only room:set-password; protected join is enforced server-side before socket membership.
- Added transient chat:typing events with client expiry and disconnect cleanup.
- Restored/pinned the on-video mobile reaction shortcut and added mobile typing presence UI.


## v3.5
- Desktop player controls auto-hide after 5 seconds and return on mouse activity.
- Mobile video reaction shortcut is always available, even before a video is selected; desktop keeps the reaction bar without the floating reaction shortcut.
- Added system badges for host/admin/self/new members plus existing custom roles.
- Host can promote/demote up to 3 assistant admins; host/admins can kick permitted members with host protections.
- Refined closed-chat mobile typing hint styling.


## v3.7
- role manager kept in the original simple flow; expanded emoji and color choices only
- image chat up to 5 MiB using temporary disk storage instead of room memory
- chat text and image messages expire after 60 minutes; temporary files are pruned automatically
- image picker accepts image/* and the mobile typing hint stays horizontally aligned

## v3.8
- Added desktop-only fullscreen chat collapse/restore without changing mobile chat behavior.
- Corrected desktop player rail direction to LTR for host and viewer.
- Restored the intended desktop 5-second control auto-hide by defining the previously missing reveal/timer handler.
- Added persistent desktop fullscreen chat + reaction shortcuts on the video surface.
- Added host-only ArrowRight/ArrowLeft ±5s seeking, preserving the existing server-authoritative host playback model.


## v3.9
- Added server-authoritative room quality mode: auto / low / high.
- Aparat resolver now preserves all detected qualities instead of discarding them after choosing one source.
- HLS manifests report actual available heights to the room and follow the server quality policy.
- Direct single-source video reports its actual videoHeight without pretending alternate qualities exist.
- Host and promoted room admins can change the room quality policy.
- Production Socket.IO client/server use polling only to avoid failed WebSocket upgrades through the current WCDN path.


## v3.10
- Added bounded, atomic server-side movie resume persistence per room.
- Only movie/source metadata, quality mode, playback time/rate and update timestamp are persisted.
- Chat/image/member/role/password state remains ephemeral and is not serialized.
- Last-room-exit still deletes temporary chat images and now flushes the final movie position before releasing RAM.
- Landing name placeholder is now `مثلا صدرا`.


## v3.11 — Chat mentions + replies
- Added server-validated mention metadata with a maximum of 8 tagged room members per message.
- Added `@` member suggestions plus direct tag actions on messages.
- Added reply metadata for text and image messages using a safe snapshot of the referenced message.
- Added responsive reply composer, reply previews, mention highlighting, keyboard navigation, and touch-friendly actions without changing playback synchronization.


## v3.12 — Media chat + timeline preview + read receipts
- Added independent timeline video preview for hover/long-press with timestamp; host playback state is untouched by preview seeking.
- Added keyboard `F` fullscreen toggle while protecting form/modal focus.
- Added mobile camera/gallery chooser and pre-send image caption composer.
- Added temporary server-backed voice messages with hold-to-record, release-to-send, slide-left-to-cancel UX and byte-range audio delivery.
- Added server-authoritative chat Seen events and one-check/two-check delivery UI.
- Added `:]` and `:[` to the chat sticker/emoji tray.
- Existing playback authority, room roles, quality, suggestions, password flow, mention/reply metadata and one-hour ephemeral chat policy are preserved.


## v3.13 — Mobile reply/composer UI fix

- CSS-only UI correction on top of v3.12.
- Mobile/short-landscape reply previews no longer inherit the over-compressed 30px treatment.
- Composer action buttons and message input use one shared control size (42px mobile, 40px short landscape).
- No Socket.IO event, message payload, voice/image upload, Seen, timeline preview, room state or server logic changed.


## v3.14 — Chat message alignment fix

- Own messages: physical right alignment in desktop, mobile portrait, mobile landscape and fullscreen chat.
- Other users: physical left alignment in all layouts.
- Bubble corner direction was swapped to match Telegram-style ownership.
- No chat transport, message payload, reply, seen, media or socket logic changed.




## v3.17.0

- Universal 5-second player-control idle timer for desktop/mobile/fullscreen with tap/hover restore.
- Volume popover is anchored vertically above the volume control, supports hover-open, and main-button mute/unmute while open.
- Portrait keyboard docking receives a final VisualViewport/Safe-Area lift and focus-based refresh.
- Server emits join/leave presence notices only to the current host/admin sockets.
- Expanded chat/role emoji sets with romantic and cat choices; server role-emoji allowlist updated.
- Added per-browser-profile saved-video persistence independent from room persistence. Saves are keyed by the private clientKey, persisted in `$HOME/.cinema/user-saved-videos.json`, capped at 40 entries per profile, and can be resumed by host/admin in any room.
- Migrated `watch-client-id` to localStorage (with sessionStorage fallback/mirroring) so the same browser profile keeps its save library across rooms/restarts.
- No dependency changes.

## v3.16.0

- Video reaction picker now remains open after each reaction; the existing outside dismiss layer is the only normal close path.
- Added `--vv-bottom-edge` from `visualViewport` measurements so portrait mobile chat is always docked above visible browser/navigation chrome, even when the keyboard is closed.
- Portrait composer safe-area padding is normalized to prevent double bottom spacing/cropping.
- No server protocol or dependency changes.

## v3.15.0
- Fixed mobile Reply/Voice message bubbles being clipped by legacy fixed max-heights.
- Normal members can create/select/remove a room role for themselves only; host permissions for assigning roles to any member remain unchanged.
- Server enforces self-only role changes for non-host users.


## v3.18.0 — Baham Bebinim public/GitHub hardening

- Renamed the public project identity to Baham Bebinim.
- Node now binds to 127.0.0.1 by default; expose it through a reverse proxy instead of opening the Node port publicly.
- Added conservative connection, room and temp-upload limits for public deployments.
- Added per-socket rate limits around join/probe, saved-video actions and expensive media resolution paths.
- Saved videos moved from one growing JSON document to lazy per-profile files with atomic writes, no TTL, bounded cache and v3.17 migration.
- Added .gitignore and .env.example for a public GitHub repository.
- Removed emoji glyphs that are commonly rendered as tofu/empty squares on older phones and forced a native color-emoji font stack for emoji controls.
- Role emoji scrolling stays functional but its native white scrollbar is hidden.
- Added basic security response headers through Next.js.


## v3.19.0 — room cleanup, exact quality, player/chat UX

- Empty room cleanup now forgets room video/progress instead of persisting it. Browser-profile Saved Videos remain independent and long-lived.
- Chat image hard limit reduced to 3 MiB on both client and server.
- Added transient centered play/pause state feedback and a dedicated exit-fullscreen icon.
- Fullscreen shortcut accepts physical KeyF plus Persian `ب`.
- Replaced low/high quality UI with actual detected resolution choices; HLS levels are locked to the selected height and direct multi-source providers select the matching source.
- Reduced non-content bandwidth/overfetch with tighter HLS buffers, a much smaller low-quality timeline-preview buffer, slower preview seek churn, and 1s host playback snapshots. Main video/audio quality is not intentionally reduced.
- Desktop source input/settings/delete controls now share one 40px height.
- Added server-authoritative moderator message deletion, including cleanup of attached temporary media.
- Chat now linkifies http(s) and www URLs without server-side URL fetching.

## v3.20.0 — reliable uploads, immediate quality, room lifecycle and modular cleanup

- Chat image transport changed from one large Socket.IO packet to bounded 192 KiB chunks.
- Each upload step has an acknowledgement timeout and explicit error code; upload sessions expire and are aborted on leave/disconnect.
- Added `room:quality` broadcast so all connected clients apply the selected HLS/direct quality immediately.
- Added a signed per-socket `pagehide` leave beacon. Normal tab/navigation exits can destroy an empty room immediately instead of waiting for the polling timeout.
- Empty room video/progress cleanup remains separate from long-lived personal Saved Videos.
- Extracted quality, chat-media upload and Socket.IO acknowledgement helpers into focused modules.
- Added `ARCHITECTURE.md` for maintainers.
