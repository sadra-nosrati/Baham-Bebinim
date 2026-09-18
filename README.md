# باهم ببینیم — Next.js Watch Together

نسخه 3.17 — رابط Mobile-first برای تماشای همزمان فیلم، چت زنده با تگ/ریپلای/ویس/تصویر، Preview تایم‌لاین، کنترل کیفیت اتاق و ری‌اکشن.

## اجرا روی Windows / PowerShell

```powershell
npm install
npm run dev
```

سپس:

```text
http://localhost:3000
```

اسکریپت dev دیگر از سینتکس لینوکسی `NODE_ENV=...` استفاده نمی‌کند و مستقیم روی Windows اجرا می‌شود.

## اجرای Production

```powershell
npm install
npm run build
npm start
```

پورت پیش‌فرض 3000 است. برای تغییر پورت در PowerShell:

```powershell
$env:PORT="4000"
npm start
```

## ورودی فیلم

میزبان می‌تواند یکی از این‌ها را وارد کند:

- لینک مستقیم MP4
- لینک مستقیم WebM
- لینک HLS / M3U8
- لینک معمولی صفحه ویدیو آپارات، مثل `https://www.aparat.com/v/zqd54i7`

برای لینک صفحه آپارات، `server.js` شناسه ویدیو را استخراج می‌کند، از API عمومی اطلاعات ویدیو را می‌گیرد و یک منبع قابل پخش (با ترجیح 720p برای موبایل) انتخاب می‌کند. اگر آپارات API یا لینک‌های فایل را تغییر دهد، برنامه پیام می‌دهد که لینک مستقیم وارد شود.


## رول‌های اختصاصی اتاق

- میزبان می‌تواند برای همه اعضا رول بسازد/اختصاص دهد و هر کاربر عادی هم فقط برای خودش رول بسازد یا انتخاب کند.
- از پنل «اعضای اتاق»، میزبان روی دکمه «رول» کنار هر شخص می‌زند.
- رول جدیدی مثل `دخترم` می‌تواند ساخته شود و همان لحظه به شخص اختصاص پیدا کند.
- رول‌های ساخته‌شده دوباره برای سایر اعضا هم قابل استفاده‌اند.
- رول کنار نام شخص در چت و داخل لیست اعضا نمایش داده می‌شود.
- تغییر یا حذف رول به‌صورت زنده برای همه افراد اتاق Sync می‌شود و پیام‌های قبلی همان شخص در اتاق نیز به‌روزرسانی می‌شوند.
- شناسه محلی مرورگر باعث می‌شود در reconnect معمولی، تا وقتی اتاق فعال است رول شخص حفظ شود.

## تجربه موبایل

- صفحه تماشا ارتفاع کامل Web App دارد و اسکرول اضافی ندارد.
- دکمه Chat روی خود پلیر قرار دارد.
- Chat در Portrait به شکل Bottom Sheet باز می‌شود و بخشی از ویدیو همچنان قابل مشاهده است.
- در Landscape، چت به صورت پنل باریک از سمت چپ باز می‌شود و بخش اصلی تصویر آزاد می‌ماند.
- ری‌اکشن‌ها در Picker شبکه‌ای هستند و اسکرول افقی ندارند.
- Scrollbarهای Native چت مخفی شده‌اند ولی اسکرول لمسی حفظ شده است.
- کنترل صدا از پنل اختصاصی انجام می‌شود. در iPhone، به دلیل محدودیت Safari، کاربر برای سطح صدا از کلیدهای فیزیکی دستگاه استفاده می‌کند و UI این موضوع را واضح نمایش می‌دهد.
- Fullscreen روی کل محیط Watch انجام می‌شود تا چت داخل حالت تمام‌صفحه باقی بماند؛ اگر Fullscreen API در دسترس نباشد، حالت app-fullscreen داخلی فعال می‌شود.

## Sync

- نفر اول اتاق Host می‌شود.
- Play / Pause / Seek / Playback Rate توسط Host همگام می‌شود.
- Host با کلیک روی خود ویدیو هم می‌تواند Play/Pause کند.
- Viewer نمی‌تواند زمان اتاق را تغییر دهد، اما Mute/Volume/Fullscreen محلی خودش را کنترل می‌کند.
- Sync دوره‌ای برای اصلاح drift انجام می‌شود.
- اگر Autoplay مرورگر موبایل مسدود شود، یک دکمه «برای شروع همزمان لمس کن» نمایش داده می‌شود.

## Chat

- Socket.IO realtime
- تاریخچه 150 پیام آخر هر اتاق در RAM
- Emoji picker شبکه‌ای
- Film reactions شناور روی ویدیو
- شمارنده پیام خوانده‌نشده
- نمایش Host با SVG به جای emoji در UI

## Production notes

این نسخه Roomها را در RAM نگه می‌دارد. برای چند سرور یا نگهداری Room پس از restart بهتر است Redis + Socket.IO Redis Adapter اضافه شود.

اگر Nginx جلوی Node قرار دارد، WebSocket upgrade باید فعال باشد.

## v2.3 mobile polish
- Landscape mobile chat now opens as a compact panel from the physical left side, keeping most of the movie visible.
- Portrait chat sheet is shorter so the movie remains visible while typing.
- Removed newer emoji glyphs that render as empty boxes on some older/low-end phones.
- Viewer control row no longer has an empty speed slot; desktop viewers get a sync button and mobile keeps a compact five-control layout.
- Socket.IO now starts with its normal polling transport and upgrades to WebSocket, avoiding noisy direct-WebSocket failures during dev remounts.
- Hydration noise caused by browser extensions modifying `<body>` is suppressed at the root, and random room-code generation runs after mount.
- Added `/favicon.ico` and App Router icon metadata.

## v2.4 UX polish
- Mobile landscape chat is a bounded left-side companion panel with internal scrolling.
- Chat, volume, reactions, and members close when tapping outside.
- Fullscreen targets the watch app so chat remains available in fullscreen-capable browsers.
- Viewer-only redundant sync control removed.
- Exit now requires confirmation.


## v2.6
- رول‌های سفارشی حالا رنگ و ایموجی قابل انتخاب دارند و همان استایل در لیست اعضا و چت نمایش داده می‌شود.
- placeholder ساخت رول به «نام رول» تغییر کرده است.
- چت موبایل movie-first شده: پنل بدون پیام جمع‌وجور است و در حالت معمول تقریباً چهار پیام را همزمان نشان می‌دهد؛ تاریخچه با اسکرول داخلی حفظ می‌شود.


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


## v2.9 mobile entry + request cooldown + clear video
- Mobile room entry no longer waits for clock calibration; join happens immediately and sync calibration runs in the background.
- Mobile/private-browser storage failures no longer block navigation; a safe one-time name fallback is used only when sessionStorage is unavailable.
- Room codes are normalized case-insensitively across devices.
- Guest Play/Pause request cooldown is 10 seconds and is still enforced server-side.
- Host can remove the current video completely; URL, title, playback state and player source are cleared for everyone.
- Mobile chat is smaller and targets about three compact visible messages so more of the movie stays visible.


## پیشنهاد فیلم توسط مهمان‌ها — v3.0

- کاربران عادی از دکمه لینک می‌توانند یک URL معتبر HTTP/HTTPS از هر سایت پیشنهاد کنند.
- پیشنهاد مستقیماً فیلم اتاق را تغییر نمی‌دهد و در صف بررسی مالک قرار می‌گیرد.
- مالک نام پیشنهاددهنده، دامنه و خود لینک را می‌بیند و می‌تواند لینک را در تب جدا باز کند، رد کند یا برای اتاق استفاده کند.
- پیشنهادهای در انتظار داخل وضعیت اتاق نگه داشته می‌شوند و با reconnect مالک از بین نمی‌روند.
- برای جلوگیری از اسپم، تعداد پیشنهادهای نگهداری‌شده محدود است و ارسال پشت‌سرهم سمت سرور rate-limit می‌شود.
- آپارات همچنان با Resolver اختصاصی به منبع پخش تبدیل می‌شود. لینک مستقیم MP4/WebM/M3U8 از هر دامنه‌ای قابل استفاده است. صفحه‌های HTML عادی، DRM یا سایت‌هایی که منبع مستقیم را در اختیار مرورگر نمی‌گذارند ممکن است برای پخش همگام به لینک مستقیم ویدیو نیاز داشته باشند.

## Mobile cinema UX — v3.1
- Fullscreen now hides the main room header and uses the full movie surface.
- On supported phones, fullscreen requests landscape orientation.
- Player controls auto-hide after 5 seconds in fullscreen and return on tap/mouse activity.
- The first tap while controls are hidden only reveals the controls, preventing accidental play/pause.
- Mobile chat tracks the Visual Viewport so the composer remains above the software keyboard.
- Chat input disables autocomplete/autofill/password-manager hints where browsers honor those attributes.


## v3.2 — Mobile landscape companion chat + universal room-code normalization
- Chat and reaction shortcuts remain visible in mobile landscape/fullscreen even after player chrome auto-hides.
- Landscape chat uses nearly the full visible viewport height while keeping a narrow side-panel width so video remains primary.
- Chat resizes against `visualViewport` when the keyboard opens instead of breaking or covering the composer.
- Portrait keyboard docking now uses the current visual/layout viewport delta, eliminating the large stale browser-chrome gap.
- Persian (`۰۱۲۳۴۵۶۷۸۹`) and Arabic-Indic (`٠١٢٣٤٥٦٧٨٩`) digits are normalized to ASCII room digits consistently on home, client join, and server.
- Room IDs now safely support Unicode letters/numbers plus `_` and `-`, and the initial random-room effect no longer overwrites a room code typed immediately on mobile.


## v3.3 — Persistent mobile chat/reaction shortcuts
- On mobile portrait and landscape, chat and reaction shortcuts on the video never follow fullscreen control auto-hide.
- The shortcuts stay visible in normal, native fullscreen and pseudo-fullscreen modes.
- No playback, sync, room, chat or socket logic changed.

## v3.4 UX additions
- Mobile video reaction shortcut stays available over the movie in portrait, landscape and fullscreen.
- Live Telegram-style typing presence shows who is typing, with a compact animated hint on mobile while chat is closed.
- Optional room password: only the current host can add/change/remove it. The landing page is unchanged; protected rooms request the password only after the room code is entered.
- Room passwords are kept server-side only as SHA-256 digests for the in-memory room lifetime; the digest is never sent to clients.


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
- Desktop fullscreen now has a dedicated chat collapse/restore control so the movie can use the full canvas without leaving fullscreen.
- Desktop player controls use a physical left-to-right timeline/control order for both host and viewer layouts.
- Fixed the desktop 5-second idle auto-hide by implementing the missing desktop control reveal/timer logic; moving the mouse over the movie reveals the rail again.
- Desktop fullscreen exposes chat and reaction shortcuts together on the video while keeping them independent from the bottom control auto-hide.
- Host keyboard shortcuts: Right Arrow seeks +5 seconds and Left Arrow seeks -5 seconds, while text inputs/modals keep their normal keyboard behavior.


## v3.9 — Room quality policy + WCDN realtime stability

- میزبان و مدیران اتاق می‌توانند کیفیت پخش کل اتاق را روی «خودکار»، «کم» یا «بالا» تنظیم کنند.
- برای Aparat، سرور کیفیت‌های واقعی فایل را از API استخراج می‌کند و در حالت کم/بالا کمترین/بیشترین کیفیت موجود را انتخاب می‌کند؛ Auto به‌صورت متعادل 720p را ترجیح می‌دهد.
- برای HLS/M3U8، Levelهای واقعی Manifest توسط Hls.js تشخیص داده می‌شوند، به سرور اتاق گزارش می‌شوند و Policy انتخاب‌شده روی همه کلاینت‌ها اعمال می‌شود.
- برای Direct MP4/WebM تک‌کیفیت، رزولوشن واقعی بعد از metadata شناسایی و نمایش داده می‌شود؛ اگر منبع فقط یک کیفیت داشته باشد، همان منبع حفظ می‌شود.
- Socket.IO در Production عمداً روی Engine.IO polling پایدار قفل شده است تا WCDN دیگر WebSocket upgrade ناموفق (`wss://... failed`) ایجاد نکند. Reconnect و realtime همچنان از مسیر Socket.IO حفظ می‌شوند.


## v3.11 — تگ و ریپلای در چت

- با تایپ `@` در کادر چت، اعضای حاضر اتاق پیشنهاد می‌شوند و انتخاب کاربر به‌صورت ID معتبر سمت سرور ثبت می‌شود.
- از روی هر پیام دیگران نیز دکمه تگ در دسترس است.
- همه پیام‌های متنی و تصویری می‌توانند Reply داشته باشند و پیش‌نمایش پیام مرجع داخل چت نمایش داده می‌شود.
- Reply به‌صورت snapshot امن ذخیره می‌شود تا با حذف/انقضای پیام مرجع، ساختار پیام جدید خراب نشود.
- تگ کاربر فعلی در پیام با استایل مشخص نمایش داده می‌شود.
- UI دسکتاپ، Portrait و Landscape موبایل برای اکشن‌های تگ/ریپلای و منوی Mention بهینه شده است.

## v3.10 — Resume movie progress only
- The server now persists only each room's current movie URL/source metadata and last playback time so returning to the same room can continue from the saved position.
- Restored rooms intentionally open paused at the saved timestamp; the new host chooses when to resume playback.
- Chat messages, chat images, members, roles, admin state and room passwords are never written to the progress file.
- When the last member leaves, chat images are deleted immediately and the in-memory room is released as before.
- Playback persistence is throttled in RAM and disk writes are globally debounced/atomic to keep I/O low; final room exit performs a small final flush.
- Saved room progress is bounded (default 1000 rooms) and expires after 90 days by default. Both limits are configurable via `CINEMA_PROGRESS_MAX` and `CINEMA_PROGRESS_TTL_DAYS`.
- Default persistence file: `$HOME/.cinema/room-progress.json` (override with `CINEMA_PROGRESS_FILE`).
- Landing-page name placeholder changed to `مثلا صدرا`.


## v3.12 — Timeline Preview + Camera/Caption + Voice + Seen
- Timeline روی دسکتاپ با Hover و روی دستگاه لمسی با نگه‌داشتن، Preview تصویری مستقل همراه زمان دقیق نشان می‌دهد؛ Preview ویدئوی اصلی را Seek نمی‌کند.
- کلید `F` بیرون از input/modal، Fullscreen را روشن/خاموش می‌کند.
- در موبایل دکمه تصویر منوی «دوربین / گالری» دارد؛ تصویر قبل از ارسال Preview می‌شود و Caption تا 500 کاراکتر قابل ثبت است.
- Voice note با MediaRecorder اضافه شده: دکمه میکروفن را نگه دارید، رها کنید تا ارسال شود و برای لغو به چپ بکشید. ویس‌ها موقت‌اند و مانند چت با TTL یک‌ساعته پاک می‌شوند.
- فایل Voice با HTTP Byte Range سرو می‌شود تا پخش و Seek در Safari/iPhone و Chrome پایدار باشد.
- `:]` و `:[` به Emoji/Sticker tray چت اضافه شدند.
- Read receipt واقعی Socket اضافه شد: پیام خود کاربر قبل از Seen یک تیک و بعد از دیده‌شدن توسط حداقل یک عضو دیگر دو تیک نشان می‌دهد. دریافت پیام به‌تنهایی Seen محسوب نمی‌شود؛ چت باید واقعاً قابل مشاهده و تب فعال باشد.


## v3.13 — Mobile reply + composer sizing
- Fixed compressed reply previews on short mobile landscape screens.
- Increased reply readability inside sent messages while keeping the original reply behavior untouched.
- Emoji, image, voice and send controls now share the exact same touch height as the message input.
- Preserved portrait, landscape, keyboard docking, media upload, voice recording, mentions, Seen state and playback behavior.


## v3.14 — Telegram-style message ownership alignment

- پیام‌های خود کاربر در تمام حالت‌ها همیشه سمت راست قرار می‌گیرند.
- پیام‌های سایر اعضا در تمام حالت‌ها همیشه سمت چپ قرار می‌گیرند.
- گوشه‌ی Bubble نیز متناسب با سمت پیام اصلاح شده است.
- این تغییر فقط CSS است و منطق Reply / Seen / Voice / Image / Mention / Socket.IO را تغییر نمی‌دهد.




## v3.17.0 — Player UX + presence + saved videos

- نوار کنترل پایین ویدیو در دسکتاپ، موبایل و Fullscreen بعد از ۵ ثانیه بی‌کاری محو می‌شود و با Hover/Mouse movement یا Tap روی خود ویدیو دوباره برمی‌گردد. اولین Tap وقتی کنترل‌ها مخفی‌اند فقط UI را برمی‌گرداند و Play/Pause ناخواسته انجام نمی‌دهد.
- پنل Volume به خود دکمه صدا Anchor شده و بالای همان دکمه باز می‌شود؛ Hover دسکتاپ نیز آن را باز می‌کند. وقتی پنل باز است، کلیک روی دکمه اصلی صدا Mute/Unmute می‌کند و Slider سطح صدا را تنظیم می‌کند.
- Portrait chat هنگام Focus ورودی با Visual Viewport و Safe Area دوباره Dock می‌شود و چند پیکسل فاصله امن بالای IME دارد تا Composer زیر کیبورد نرود.
- ورود/خروج اعضا با event سروری اختصاصی فقط برای میزبان و مدیران اتاق Toast نشان می‌دهد.
- Emojiهای رمانتیک/بوس/گربه به Chat و Role picker اضافه شدند.
- کتابخانه «ویدیوهای ذخیره‌شده» اضافه شد. میزبان/مدیر می‌تواند موقعیت فعلی را ذخیره کند و بعداً در هر Room که دسترسی مدیریت دارد همان ویدیو را از Timestamp ذخیره‌شده ادامه دهد.
- چون پروژه سیستم Login واقعی ندارد، کتابخانه Save به `clientKey` پایدار همان Browser Profile وصل است؛ شناسه در `localStorage` نگهداری می‌شود و داده‌ها سمت سرور در `$HOME/.cinema/user-saved-videos.json` ذخیره می‌شوند. این Saveها به Room خاص وابسته نیستند و بعد از Restart سرور هم باقی می‌مانند.
- هیچ Dependency جدیدی اضافه نشده است.

## v3.16.0

- پنل Reaction ویدیو بعد از انتخاب ایموجی دیگر خودکار بسته نمی‌شود؛ کاربر می‌تواند چند Reaction پشت‌سرهم بفرستد و پنل فقط با کلیک/تاچ بیرون بسته می‌شود.
- این رفتار در موبایل، دسکتاپ و Fullscreen یکسان است.
- در موبایل Portrait پایین Chat Panel به Visual Viewport واقعی Dock می‌شود تا Browser Chrome / Navigation Bar باعث بریده‌شدن Composer و پایین چت نشود.
- Safe Area پایین گوشی حفظ شده و منطق Socket، Chat، Voice، Reply، Seen و Role تغییر نکرده است.

## v3.15.0
- Fixed mobile Reply/Voice message bubbles being clipped by legacy fixed max-heights.
- Normal members can create/select/remove a room role for themselves only; host permissions for assigning roles to any member remain unchanged.
- Server enforces self-only role changes for non-host users.
