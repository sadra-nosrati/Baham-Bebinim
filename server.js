const { createServer } = require('http');
const { createHash, timingSafeEqual, randomBytes } = require('crypto');
const fs = require('fs');
const path = require('path');
const next = require('next');
const { Server } = require('socket.io');
const { createChunkedImageUploadStore } = require('./server/chunkedImageUploads');
const { normalizeQualityMode, qualityModeHeight, qualityNumber, normalizeQualityOptions, selectQualitySource } = require('./server/quality');

const dev = process.env.NODE_ENV !== 'production' && !process.argv.includes('--production');
const hostname = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const rooms = new Map();
const MESSAGE_LIMIT = 150;
const ROLE_LIMIT = 16;
const VIDEO_SUGGESTION_LIMIT = 20;
const ADMIN_LIMIT = 3;
const CHAT_TTL_MS = 60 * 60 * 1000;
const CHAT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const CHAT_AUDIO_MAX_BYTES = 8 * 1024 * 1024;
const CHAT_VOICE_MAX_MS = 5 * 60 * 1000;
const DATA_HOME = process.env.BAHAM_BEBINIM_DATA_DIR || path.join(process.env.HOME || '/tmp', '.baham-bebinim');
const LEGACY_DATA_HOME = path.join(process.env.HOME || '/tmp', '.cinema');
const CHAT_UPLOAD_DIR = process.env.BAHAM_BEBINIM_CHAT_UPLOAD_DIR || process.env.CHAT_UPLOAD_DIR || '/tmp/baham-bebinim-chat';
const CHAT_UPLOAD_PREFIX = '/chat-image/';
const CHAT_AUDIO_PREFIX = '/chat-audio/';
const CHAT_MENTION_LIMIT = 8;

// Browser-profile saved videos. Baham Bebinim has no server-side account system yet,
// so the opaque clientKey is used as a private browser-profile identifier. Saved-video
// files are split per profile to avoid rewriting one growing JSON file on every save.
const USER_SAVES_DIR = process.env.BAHAM_BEBINIM_USER_SAVES_DIR || path.join(DATA_HOME, 'saved-videos');
const LEGACY_USER_SAVES_FILE = process.env.CINEMA_USER_SAVES_FILE || path.join(LEGACY_DATA_HOME, 'user-saved-videos.json');
const configuredUserSavesMax = Number(process.env.BAHAM_BEBINIM_USER_SAVES_MAX);
const configuredUserProfilesMax = Number(process.env.BAHAM_BEBINIM_SAVED_PROFILE_MAX);
const USER_SAVES_MAX_PER_USER = Number.isFinite(configuredUserSavesMax) ? Math.max(20, Math.min(1000, Math.floor(configuredUserSavesMax))) : 200;
const USER_SAVES_MAX_PROFILES = Number.isFinite(configuredUserProfilesMax) ? Math.max(100, Math.min(50000, Math.floor(configuredUserProfilesMax))) : 5000;
const USER_SAVES_CACHE_MAX = 128;
const USER_SAVES_FLUSH_MS = 1500;
const savedUserVideos = new Map();
const savedUserVideoTouches = new Map();
const savedProfileIds = new Set();
const dirtyUserSaveKeys = new Set();
const userSavesFlushTimers = new Map();

// Public-instance guardrails. They are deliberately conservative for a small VPS and
// can be raised with environment variables without changing source code.
const configuredMaxConnections = Number(process.env.BAHAM_BEBINIM_MAX_CONNECTIONS);
const configuredMaxRoomMembers = Number(process.env.BAHAM_BEBINIM_MAX_ROOM_MEMBERS);
const configuredMaxActiveRooms = Number(process.env.BAHAM_BEBINIM_MAX_ACTIVE_ROOMS);
const configuredUploadBudgetMb = Number(process.env.BAHAM_BEBINIM_CHAT_TEMP_MAX_MB);
const MAX_SOCKET_CONNECTIONS = Number.isFinite(configuredMaxConnections) ? Math.max(20, Math.min(5000, Math.floor(configuredMaxConnections))) : 200;
const MAX_ROOM_MEMBERS = Number.isFinite(configuredMaxRoomMembers) ? Math.max(2, Math.min(500, Math.floor(configuredMaxRoomMembers))) : 50;
const MAX_ACTIVE_ROOMS = Number.isFinite(configuredMaxActiveRooms) ? Math.max(20, Math.min(10000, Math.floor(configuredMaxActiveRooms))) : 1000;
const CHAT_UPLOAD_MAX_TOTAL_BYTES = (Number.isFinite(configuredUploadBudgetMb) ? Math.max(32, Math.min(4096, configuredUploadBudgetMb)) : 256) * 1024 * 1024;
let chatUploadBytes = 0;
const imageUploadStore = createChunkedImageUploadStore({
  maxFileBytes: CHAT_IMAGE_MAX_BYTES,
  chunkBytes: 192 * 1024,
  ttlMs: 45 * 1000,
  maxReservedBytes: Math.min(CHAT_UPLOAD_MAX_TOTAL_BYTES, 32 * 1024 * 1024),
});

// Persist only the minimal room resume state. Chat, uploaded media, members, roles,
// passwords and moderation state intentionally remain ephemeral.
const ROOM_PROGRESS_FILE = process.env.BAHAM_BEBINIM_PROGRESS_FILE || process.env.CINEMA_PROGRESS_FILE || path.join(DATA_HOME, 'room-progress.json');
const LEGACY_ROOM_PROGRESS_FILE = path.join(LEGACY_DATA_HOME, 'room-progress.json');
const configuredProgressTtlDays = Number(process.env.BAHAM_BEBINIM_PROGRESS_TTL_DAYS || process.env.CINEMA_PROGRESS_TTL_DAYS);
const configuredProgressMax = Number(process.env.BAHAM_BEBINIM_PROGRESS_MAX || process.env.CINEMA_PROGRESS_MAX);
const ROOM_PROGRESS_TTL_MS = (Number.isFinite(configuredProgressTtlDays) ? Math.max(1, Math.min(3650, configuredProgressTtlDays)) : 90) * 24 * 60 * 60 * 1000;
const ROOM_PROGRESS_MAX = Number.isFinite(configuredProgressMax) ? Math.max(50, Math.min(5000, Math.floor(configuredProgressMax))) : 1000;
const ROOM_PROGRESS_SNAPSHOT_MS = 5000;
const ROOM_CRASH_RECOVERY_MS = 15 * 60 * 1000;
const ROOM_PROGRESS_FLUSH_MS = 10000;
const savedRoomProgress = new Map();
const roomProgressSnapshotAt = new Map();
let roomProgressDirty = false;
let roomProgressFlushTimer = null;
const ALLOWED_REACTIONS = new Set(['😂','😱','❤️','🍿','🔥','😭','👀','👏','🎬','😍']);
const ALLOWED_ROLE_EMOJIS = new Set(['','❤️','⭐','🔥','🌙','🎬','🍿','👑','🌸','✨','💞','🎧','😈','💎','⚡','🌊','☕','🚀','🎮','😘','💋','😍','💕','💗','💖','😽','😻','🐱','🐈','😺','😸','😹','😿','🌹']);
const ALLOWED_ROLE_COLORS = new Set(['#ff5c7c','#ff9f43','#ffd166','#54d49a','#4dd0e1','#6c8cff','#b983ff','#f472b6','#7c4dff','#5bd0c5','#ff7a59','#8bd450','#f6a6ff','#7aa2ff']);

function cleanRoomId(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .trim()
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 48)
    .toUpperCase();
}
function cleanName(value) {
  return String(value || 'مهمان').trim().slice(0, 30) || 'مهمان';
}
function cleanText(value) {
  return String(value || '').trim().slice(0, 500);
}
function cleanMessageId(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}
function safeTokenEquals(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

function readSmallJson(req, maxBytes = 4096) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(Object.assign(new Error('payload-too-large'), { code: 'payload-too-large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('invalid-json'), { code: 'invalid-json' })); }
    });
    req.on('error', reject);
  });
}
function buildReplySnapshot(room, replyToId) {
  const id = cleanMessageId(replyToId);
  if (!id) return null;
  const target = (room.messages || []).find(message => message.id === id);
  if (!target) return null;
  return {
    id: target.id,
    senderId: target.senderId,
    senderName: cleanName(target.senderName),
    text: cleanText(target.text).slice(0, 160),
    hasImage: Boolean(target.imageUrl),
    imageName: String(target.imageName || '').slice(0, 120),
    hasAudio: Boolean(target.audioUrl),
    audioDurationMs: Math.max(0, Math.min(CHAT_VOICE_MAX_MS, Number(target.audioDurationMs) || 0)),
  };
}
function buildMentionSnapshots(room, mentionIds, text) {
  if (!Array.isArray(mentionIds) || !text) return [];
  const mentions = [];
  const seen = new Set();
  for (const rawId of mentionIds) {
    if (mentions.length >= CHAT_MENTION_LIMIT) break;
    const id = String(rawId || '').trim();
    if (!id || seen.has(id)) continue;
    const member = room.members.get(id);
    if (!member) continue;
    const name = cleanName(member.name);
    if (!String(text).includes(`@${name}`)) continue;
    seen.add(id);
    mentions.push({ id: member.id, name });
  }
  return mentions;
}
function cleanRoleName(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 24);
}
function cleanRoleEmoji(value) {
  const emoji = String(value || '');
  return ALLOWED_ROLE_EMOJIS.has(emoji) ? emoji : '❤️';
}
function cleanRoleColor(value) {
  const color = String(value || '').toLowerCase();
  return ALLOWED_ROLE_COLORS.has(color) ? color : '#ff5c7c';
}

function safeImageType(value, name = '') {
  const type = String(value || '').trim().toLowerCase().slice(0, 100);
  const allowed = new Set(['image/jpeg','image/png','image/gif','image/webp','image/avif','image/heic','image/heif','image/bmp','image/tiff','image/x-icon']);
  if (allowed.has(type)) return type;
  const ext = path.extname(String(name || '')).toLowerCase();
  const byExt = {
    '.jpg':'image/jpeg','.jpeg':'image/jpeg','.jfif':'image/jpeg','.png':'image/png','.gif':'image/gif',
    '.webp':'image/webp','.avif':'image/avif','.heic':'image/heic','.heif':'image/heif','.bmp':'image/bmp',
    '.tif':'image/tiff','.tiff':'image/tiff','.ico':'image/x-icon'
  };
  return byExt[ext] || '';
}
function safeImageExtension(name, type) {
  const raw = path.extname(String(name || '')).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 12);
  if (raw && raw.length > 1) return raw;
  const subtype = String(type || '').split('/')[1]?.split('+')[0]?.replace(/[^a-z0-9]/g, '').slice(0, 8);
  return subtype ? `.${subtype}` : '.img';
}
function safeAudioType(value) {
  const type = String(value || '').trim().toLowerCase().split(';')[0].slice(0, 100);
  return new Set(['audio/webm','audio/ogg','audio/mp4','audio/mpeg','audio/wav','audio/x-wav','audio/aac']).has(type) ? type : '';
}
function safeAudioExtension(type) {
  return ({
    'audio/webm':'.webm','audio/ogg':'.ogg','audio/mp4':'.m4a','audio/mpeg':'.mp3',
    'audio/wav':'.wav','audio/x-wav':'.wav','audio/aac':'.aac'
  })[safeAudioType(type)] || '.audio';
}
function chatImagePathFromUrl(url) {
  const value = String(url || '');
  if (!value.startsWith(CHAT_UPLOAD_PREFIX)) return '';
  const filename = value.slice(CHAT_UPLOAD_PREFIX.length);
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return '';
  return path.join(CHAT_UPLOAD_DIR, filename);
}
function chatAudioPathFromUrl(url) {
  const value = String(url || '');
  if (!value.startsWith(CHAT_AUDIO_PREFIX)) return '';
  const filename = value.slice(CHAT_AUDIO_PREFIX.length);
  if (!/^[a-zA-Z0-9._-]+$/.test(filename)) return '';
  return path.join(CHAT_UPLOAD_DIR, filename);
}
function deleteChatUpload(url) {
  const filepath = chatImagePathFromUrl(url) || chatAudioPathFromUrl(url);
  if (!filepath) return;
  fs.stat(filepath, (statError, stat) => {
    fs.unlink(filepath, (unlinkError) => {
      if (!unlinkError && !statError && stat?.isFile()) chatUploadBytes = Math.max(0, chatUploadBytes - stat.size);
    });
  });
  fs.unlink(`${filepath}.meta`, () => {});
}
function deleteChatImage(url) { deleteChatUpload(url); }
function deleteChatAudio(url) { deleteChatUpload(url); }
function pruneRoomMessages(room, now = Date.now()) {
  const keep = [];
  const removedIds = [];
  for (const message of room.messages || []) {
    if (now - Number(message.createdAt || 0) >= CHAT_TTL_MS) {
      removedIds.push(message.id);
      if (message.imageUrl) deleteChatImage(message.imageUrl);
      if (message.audioUrl) deleteChatAudio(message.audioUrl);
    } else keep.push(message);
  }
  room.messages = keep.slice(-MESSAGE_LIMIT);
  return removedIds;
}
function cleanupUploadDir({ purgeAll = false } = {}) {
  fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
  fs.readdir(CHAT_UPLOAD_DIR, (error, files = []) => {
    if (error) return;
    const cutoff = Date.now() - CHAT_TTL_MS;
    for (const filename of files) {
      if (!/^[a-zA-Z0-9._-]+$/.test(filename)) continue;
      const filepath = path.join(CHAT_UPLOAD_DIR, filename);
      fs.stat(filepath, (statError, stat) => {
        if (!statError && stat.isFile() && (purgeAll || stat.mtimeMs < cutoff)) fs.unlink(filepath, (unlinkError) => { if (!unlinkError) chatUploadBytes = Math.max(0, chatUploadBytes - stat.size); });
      });
    }
  });
}

function cleanClientKey(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}
function allowSocketAction(socket, key, limit, windowMs) {
  if (!socket?.data) return false;
  if (!(socket.data.actionWindows instanceof Map)) socket.data.actionWindows = new Map();
  const now = Date.now();
  const bucketKey = String(key || 'default').slice(0, 48);
  const current = socket.data.actionWindows.get(bucketKey);
  if (!current || now - current.startedAt >= windowMs) {
    socket.data.actionWindows.set(bucketKey, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function cleanRoomPassword(value) {
  return String(value ?? '').normalize('NFKC').slice(0, 64);
}
function passwordDigest(value) {
  return createHash('sha256').update(cleanRoomPassword(value), 'utf8').digest();
}
function passwordMatches(storedDigest, value) {
  if (!storedDigest) return true;
  const candidate = passwordDigest(value);
  return Buffer.isBuffer(storedDigest) && storedDigest.length === candidate.length && timingSafeEqual(storedDigest, candidate);
}
function validMediaUrl(value) {
  const raw = String(value || '').trim().slice(0, 2048);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    return url.toString();
  } catch {
    return '';
  }
}
function extractAparatHash(value) {
  try {
    const url = new URL(String(value || '').trim());
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    if (host !== 'aparat.com') return '';
    const match = url.pathname.match(/^\/v\/([a-zA-Z0-9_-]+)/i);
    return match?.[1] || '';
  } catch {
    return '';
  }
}

function cleanSavedProgress(value) {
  if (!value || typeof value !== 'object') return null;
  const originalUrl = validMediaUrl(value.originalUrl || value.videoUrl);
  if (!originalUrl) return null;
  const fallbackVideoUrl = validMediaUrl(value.videoUrl) || originalUrl;
  const time = Number(value.time);
  const rate = Number(value.rate);
  const updatedAt = Number(value.updatedAt);
  return {
    originalUrl,
    videoUrl: fallbackVideoUrl,
    provider: String(value.provider || 'direct').slice(0, 24),
    videoTitle: String(value.videoTitle || '').slice(0, 160),
    qualityMode: normalizeQualityMode(value.qualityMode),
    time: Number.isFinite(time) ? Math.max(0, Math.min(31 * 24 * 60 * 60, time)) : 0,
    rate: Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : Date.now(),
  };
}

function pruneSavedProgress(now = Date.now()) {
  for (const [roomId, progress] of savedRoomProgress) {
    if (!progress || now - Number(progress.updatedAt || 0) > ROOM_PROGRESS_TTL_MS) {
      savedRoomProgress.delete(roomId);
      roomProgressSnapshotAt.delete(roomId);
      roomProgressDirty = true;
    }
  }
  if (savedRoomProgress.size <= ROOM_PROGRESS_MAX) return;
  const ordered = [...savedRoomProgress.entries()].sort((a, b) => Number(a[1]?.updatedAt || 0) - Number(b[1]?.updatedAt || 0));
  for (const [roomId] of ordered.slice(0, savedRoomProgress.size - ROOM_PROGRESS_MAX)) {
    savedRoomProgress.delete(roomId);
    roomProgressSnapshotAt.delete(roomId);
    roomProgressDirty = true;
  }
}

function loadSavedProgress() {
  const candidates = [ROOM_PROGRESS_FILE];
  if (LEGACY_ROOM_PROGRESS_FILE !== ROOM_PROGRESS_FILE) candidates.push(LEGACY_ROOM_PROGRESS_FILE);
  let legacyFormatFound = false;
  for (const candidate of candidates) {
    try {
      const raw = fs.readFileSync(candidate, 'utf8');
      const parsed = JSON.parse(raw);
      // v3.18 and older persisted room videos even after the room became empty.
      // Do not import that format into v3.19; personal Saved Videos are separate.
      if (Number(parsed?.version || 0) < 2) { legacyFormatFound = true; continue; }
      const source = parsed && typeof parsed.rooms === 'object' ? parsed.rooms : null;
      if (!source || typeof source !== 'object') continue;
      for (const [rawRoomId, value] of Object.entries(source)) {
        const roomId = cleanRoomId(rawRoomId);
        const progress = cleanSavedProgress(value);
        if (roomId && progress) savedRoomProgress.set(roomId, progress);
      }
      pruneSavedProgress();
      if (candidate !== ROOM_PROGRESS_FILE && savedRoomProgress.size) {
        roomProgressDirty = true;
        flushSavedProgressNow();
      }
      return;
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn('[room-progress:load]', error?.message || error);
    }
  }
  if (legacyFormatFound) {
    roomProgressDirty = true;
    flushSavedProgressNow();
  }
}

function flushSavedProgressNow() {
  if (!roomProgressDirty) return;
  try {
    pruneSavedProgress();
    const directory = path.dirname(ROOM_PROGRESS_FILE);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const roomsObject = Object.fromEntries(savedRoomProgress.entries());
    const payload = JSON.stringify({ version: 2, savedAt: Date.now(), rooms: roomsObject });
    const tempPath = `${ROOM_PROGRESS_FILE}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, ROOM_PROGRESS_FILE);
    roomProgressDirty = false;
  } catch (error) {
    console.error('[room-progress:flush]', error?.message || error);
  }
}

function scheduleSavedProgressFlush(delay = ROOM_PROGRESS_FLUSH_MS) {
  roomProgressDirty = true;
  if (roomProgressFlushTimer) return;
  roomProgressFlushTimer = setTimeout(() => {
    roomProgressFlushTimer = null;
    flushSavedProgressNow();
  }, Math.max(250, Number(delay) || ROOM_PROGRESS_FLUSH_MS));
  roomProgressFlushTimer.unref?.();
}

function forgetRoomProgress(roomId, immediate = false) {
  if (!roomId) return;
  if (savedRoomProgress.delete(roomId)) {
    roomProgressSnapshotAt.delete(roomId);
    scheduleSavedProgressFlush(immediate ? 250 : ROOM_PROGRESS_FLUSH_MS);
    if (immediate) flushSavedProgressNow();
  }
}

function saveRoomProgress(roomId, room, { force = false, immediate = false } = {}) {
  if (!roomId || !room) return;
  if (!room.videoUrl || !room.originalUrl) {
    forgetRoomProgress(roomId, immediate);
    return;
  }
  const now = Date.now();
  const lastSnapshot = Number(roomProgressSnapshotAt.get(roomId) || 0);
  if (!force && now - lastSnapshot < ROOM_PROGRESS_SNAPSHOT_MS) return;
  const playback = currentPlayback(room);
  savedRoomProgress.set(roomId, {
    originalUrl: room.originalUrl,
    videoUrl: room.videoUrl,
    provider: room.provider || 'direct',
    videoTitle: room.videoTitle || '',
    qualityMode: normalizeQualityMode(room.qualityMode),
    time: Math.max(0, Number(playback.time) || 0),
    rate: Math.max(0.5, Math.min(2, Number(playback.rate) || 1)),
    updatedAt: now,
  });
  roomProgressSnapshotAt.set(roomId, now);
  pruneSavedProgress(now);
  scheduleSavedProgressFlush(immediate ? 250 : ROOM_PROGRESS_FLUSH_MS);
  if (immediate) flushSavedProgressNow();
}


function cleanSavedVideoItem(value) {
  if (!value || typeof value !== 'object') return null;
  const originalUrl = validMediaUrl(value.originalUrl || value.videoUrl);
  if (!originalUrl) return null;
  const time = Number(value.time);
  const rate = Number(value.rate);
  const updatedAt = Number(value.updatedAt || value.savedAt);
  const id = cleanMessageId(value.id) || `sv_${createHash('sha256').update(originalUrl).digest('hex').slice(0,18)}`;
  return {
    id,
    originalUrl,
    provider: String(value.provider || 'direct').slice(0,24),
    videoTitle: String(value.videoTitle || '').trim().slice(0,160),
    qualityMode: normalizeQualityMode(value.qualityMode),
    time: Number.isFinite(time) ? Math.max(0, Math.min(31 * 24 * 60 * 60, time)) : 0,
    rate: Number.isFinite(rate) ? Math.max(0.5, Math.min(2, rate)) : 1,
    savedAt: Number.isFinite(Number(value.savedAt)) ? Number(value.savedAt) : Date.now(),
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
  };
}

function publicSavedVideo(item) {
  return {
    id: item.id,
    originalUrl: item.originalUrl,
    provider: item.provider,
    videoTitle: item.videoTitle,
    qualityMode: item.qualityMode,
    time: item.time,
    rate: item.rate,
    savedAt: item.savedAt,
    updatedAt: item.updatedAt,
  };
}

function savedProfileId(clientKey) {
  const key = cleanClientKey(clientKey);
  return key ? createHash('sha256').update(key).digest('hex').slice(0, 40) : '';
}

function savedProfilePath(clientKey) {
  const id = savedProfileId(clientKey);
  return id ? path.join(USER_SAVES_DIR, `${id}.json`) : '';
}

function touchUserSaveCache(clientKey) {
  const key = cleanClientKey(clientKey);
  if (!key) return;
  savedUserVideoTouches.set(key, Date.now());
  if (savedUserVideos.size <= USER_SAVES_CACHE_MAX) return;
  const candidates = [...savedUserVideoTouches.entries()]
    .filter(([candidate]) => !dirtyUserSaveKeys.has(candidate))
    .sort((a, b) => a[1] - b[1]);
  while (savedUserVideos.size > USER_SAVES_CACHE_MAX && candidates.length) {
    const [candidate] = candidates.shift();
    savedUserVideos.delete(candidate);
    savedUserVideoTouches.delete(candidate);
  }
}

function writeSavedProfileFile(clientKey) {
  const key = cleanClientKey(clientKey);
  if (!key) return;
  const filepath = savedProfilePath(key);
  const profileId = savedProfileId(key);
  const items = (savedUserVideos.get(key) || []).slice(0, USER_SAVES_MAX_PER_USER);
  try {
    fs.mkdirSync(USER_SAVES_DIR, { recursive: true, mode: 0o700 });
    if (!items.length) {
      try { fs.unlinkSync(filepath); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
      savedProfileIds.delete(profileId);
      dirtyUserSaveKeys.delete(key);
      return;
    }
    const payload = JSON.stringify({ version: 2, savedAt: Date.now(), items });
    const tempPath = `${filepath}.${process.pid}.tmp`;
    fs.writeFileSync(tempPath, payload, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempPath, filepath);
    savedProfileIds.add(profileId);
    dirtyUserSaveKeys.delete(key);
  } catch (error) {
    console.error('[user-saves:flush]', error?.message || error);
  }
}

function scheduleUserSavedVideosFlush(clientKey, delay = USER_SAVES_FLUSH_MS) {
  const key = cleanClientKey(clientKey);
  if (!key) return;
  dirtyUserSaveKeys.add(key);
  if (userSavesFlushTimers.has(key)) return;
  const timer = setTimeout(() => {
    userSavesFlushTimers.delete(key);
    writeSavedProfileFile(key);
  }, Math.max(300, Number(delay) || USER_SAVES_FLUSH_MS));
  timer.unref?.();
  userSavesFlushTimers.set(key, timer);
}

function flushUserSavedVideosNow(clientKey = '') {
  const key = cleanClientKey(clientKey);
  const keys = key ? [key] : [...dirtyUserSaveKeys];
  for (const candidate of keys) {
    const timer = userSavesFlushTimers.get(candidate);
    if (timer) clearTimeout(timer);
    userSavesFlushTimers.delete(candidate);
    writeSavedProfileFile(candidate);
  }
}

function initializeUserSavedVideosStorage() {
  try {
    fs.mkdirSync(USER_SAVES_DIR, { recursive: true, mode: 0o700 });
    for (const filename of fs.readdirSync(USER_SAVES_DIR)) {
      const match = filename.match(/^([a-f0-9]{40})\.json$/);
      if (match) savedProfileIds.add(match[1]);
    }
  } catch (error) {
    console.warn('[user-saves:init]', error?.message || error);
  }

  // One-time import from v3.17's monolithic ~/.cinema file. The old file is kept
  // untouched as a safety backup; the marker prevents re-importing every restart.
  const markerPath = path.join(USER_SAVES_DIR, '.legacy-v1-imported');
  if (fs.existsSync(markerPath) || !fs.existsSync(LEGACY_USER_SAVES_FILE)) return;
  try {
    const parsed = JSON.parse(fs.readFileSync(LEGACY_USER_SAVES_FILE, 'utf8'));
    const source = parsed && typeof parsed.users === 'object' ? parsed.users : parsed;
    if (source && typeof source === 'object') {
      for (const [rawKey, values] of Object.entries(source)) {
        if (savedProfileIds.size >= USER_SAVES_MAX_PROFILES) break;
        const key = cleanClientKey(rawKey);
        if (!key || !Array.isArray(values)) continue;
        const profileId = savedProfileId(key);
        const filepath = savedProfilePath(key);
        if (!profileId || fs.existsSync(filepath)) continue;
        const items = values.map(cleanSavedVideoItem).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, USER_SAVES_MAX_PER_USER);
        if (!items.length) continue;
        const payload = JSON.stringify({ version: 2, savedAt: Date.now(), items });
        fs.writeFileSync(filepath, payload, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        savedProfileIds.add(profileId);
      }
    }
    fs.writeFileSync(markerPath, String(Date.now()), { encoding: 'utf8', mode: 0o600 });
  } catch (error) {
    console.warn('[user-saves:migrate]', error?.message || error);
  }
}

function getUserSavedVideos(clientKey) {
  const key = cleanClientKey(clientKey);
  if (!key) return [];
  if (!savedUserVideos.has(key)) {
    let items = [];
    const filepath = savedProfilePath(key);
    try {
      const parsed = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      const source = Array.isArray(parsed?.items) ? parsed.items : [];
      items = source.map(cleanSavedVideoItem).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, USER_SAVES_MAX_PER_USER);
      if (items.length) savedProfileIds.add(savedProfileId(key));
    } catch (error) {
      if (error?.code !== 'ENOENT') console.warn('[user-saves:read]', error?.message || error);
    }
    savedUserVideos.set(key, items);
  }
  touchUserSaveCache(key);
  return (savedUserVideos.get(key) || []).slice().sort((a, b) => b.updatedAt - a.updatedAt);
}

function saveVideoToUserProfile(clientKey, room) {
  const key = cleanClientKey(clientKey);
  if (!key || !room?.originalUrl || !room?.videoUrl) return null;
  const profileId = savedProfileId(key);
  if (!savedProfileIds.has(profileId) && !dirtyUserSaveKeys.has(key) && savedProfileIds.size >= USER_SAVES_MAX_PROFILES) return null;
  const now = Date.now();
  const playback = currentPlayback(room);
  const existing = getUserSavedVideos(key);
  const same = existing.find(item => item.originalUrl === room.originalUrl);
  const item = cleanSavedVideoItem({
    id: same?.id || `sv_${createHash('sha256').update(`${key}|${room.originalUrl}`).digest('hex').slice(0,18)}`,
    originalUrl: room.originalUrl,
    provider: room.provider || 'direct',
    videoTitle: room.videoTitle || '',
    qualityMode: normalizeQualityMode(room.qualityMode),
    time: Math.max(0, Number(playback.time) || 0),
    rate: Math.max(0.5, Math.min(2, Number(playback.rate) || 1)),
    savedAt: same?.savedAt || now,
    updatedAt: now,
  });
  if (!item) return null;
  const next = [item, ...existing.filter(entry => entry.id !== item.id && entry.originalUrl !== item.originalUrl)].slice(0, USER_SAVES_MAX_PER_USER);
  savedUserVideos.set(key, next);
  touchUserSaveCache(key);
  scheduleUserSavedVideosFlush(key);
  return item;
}

function deleteUserSavedVideo(clientKey, id) {
  const key = cleanClientKey(clientKey);
  const cleanId = cleanMessageId(id);
  if (!key || !cleanId) return false;
  const current = getUserSavedVideos(key);
  const next = current.filter(item => item.id !== cleanId);
  if (next.length === current.length) return false;
  savedUserVideos.set(key, next);
  touchUserSaveCache(key);
  scheduleUserSavedVideosFlush(key);
  return true;
}

function emitModeratorPresence(io, roomId, room, payload, excludeId = '') {
  if (!room || !payload) return;
  for (const member of room.members.values()) {
    if (!member?.id || member.id === excludeId) continue;
    const moderator = member.id === room.hostId || Boolean(member.clientKey && room.adminKeys.has(member.clientKey));
    if (moderator) io.to(member.id).emit('room:presence', payload);
  }
}

function aparatSources(fileLinks) {
  if (!Array.isArray(fileLinks)) return [];
  const candidates = [];
  const seen = new Set();
  for (const item of fileLinks) {
    const quality = qualityNumber(item);
    const urls = Array.isArray(item?.urls) ? item.urls : [];
    for (const url of urls) {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
      const key = `${quality}|${url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ url, quality });
    }
  }
  return candidates.sort((a, b) => (a.quality || 99999) - (b.quality || 99999));
}

async function resolveMediaInput(value, qualityMode = 'auto') {
  const originalUrl = validMediaUrl(value);
  if (!originalUrl) return { ok: false, error: 'invalid-url' };

  const aparatHash = extractAparatHash(originalUrl);
  if (!aparatHash) return { ok: true, videoUrl: originalUrl, originalUrl, provider: 'direct', title: '', videoSources: [{ url: originalUrl, quality: 0 }], qualityOptions: [] };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const apiUrl = `https://www.aparat.com/api/fa/v1/video/video/show/videohash/${encodeURIComponent(aparatHash)}?pr=1&mf=1&referer=direct`;
    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        accept: 'application/json,text/plain,*/*',
        'user-agent': 'BahamBebinim/3.20',
        referer: originalUrl,
      },
    });
    if (!response.ok) throw new Error(`Aparat API ${response.status}`);
    const payload = await response.json();
    const attrs = payload?.data?.attributes || payload?.data || {};
    const videoSources = aparatSources(attrs.file_link_all);
    const selected = selectQualitySource(videoSources, qualityMode);
    if (!selected?.url) throw new Error('No playable Aparat source');
    return {
      ok: true,
      videoUrl: selected.url,
      originalUrl,
      provider: 'aparat',
      title: String(attrs.title || '').slice(0, 160),
      videoSources,
      qualityOptions: normalizeQualityOptions(videoSources.map(item => item.quality)),
    };
  } catch (error) {
    console.warn('[Aparat resolver]', error?.message || error);
    return { ok: false, error: 'aparat-resolve-failed' };
  } finally {
    clearTimeout(timeout);
  }
}

function createRoom() {
  return {
    hostId: null,
    videoUrl: '',
    originalUrl: '',
    provider: 'direct',
    videoTitle: '',
    qualityMode: 'auto',
    qualityOptions: [],
    videoSources: [],
    playback: { playing: false, time: 0, rate: 1, updatedAt: Date.now() },
    members: new Map(),
    adminKeys: new Set(),
    roles: new Map(),
    roleAssignments: new Map(),
    playbackRequestCooldowns: new Map(),
    videoSuggestionCooldowns: new Map(),
    videoSuggestions: [],
    messages: [],
    passwordDigest: null,
  };
}

function recoverableRoomProgress(roomId) {
  const saved = cleanSavedProgress(savedRoomProgress.get(roomId));
  if (!saved) return null;
  if (Date.now() - Number(saved.updatedAt || 0) > ROOM_CRASH_RECOVERY_MS) {
    forgetRoomProgress(roomId);
    return null;
  }
  return saved;
}

function getRoom(roomId) {
  if (rooms.has(roomId)) return rooms.get(roomId);

  const room = createRoom();
  const saved = recoverableRoomProgress(roomId);
  if (saved) {
    room.videoUrl = saved.videoUrl;
    room.originalUrl = saved.originalUrl;
    room.provider = saved.provider;
    room.videoTitle = saved.videoTitle;
    room.qualityMode = saved.qualityMode;
    room.playback = { playing: false, time: saved.time, rate: saved.rate, updatedAt: Date.now() };
    // Aparat direct file URLs can expire. Join must stay instant, so use the
    // persisted source immediately and refresh it in the background after join.
    room.restoreRefreshPending = Boolean(extractAparatHash(saved.originalUrl));
  }
  rooms.set(roomId, room);
  return room;
}
function currentPlayback(room) {
  const p = room.playback;
  if (!p.playing) return p;
  return {
    ...p,
    time: Math.max(0, p.time + ((Date.now() - p.updatedAt) / 1000) * (p.rate || 1)),
    updatedAt: Date.now(),
  };
}
function publicVideoSuggestions(room) {
  return (room.videoSuggestions || []).map(({ id, url, senderId, senderName, createdAt }) => ({ id, url, senderId, senderName, createdAt }));
}
function publicMembers(room) {
  return [...room.members.values()].map(({ clientKey, ...member }) => ({
    ...member,
    isAdmin: Boolean(clientKey && member.id !== room.hostId && room.adminKeys.has(clientKey)),
  }));
}
function publicRoom(room) {
  pruneRoomMessages(room);
  return {
    hostId: room.hostId,
    videoUrl: room.videoUrl,
    originalUrl: room.originalUrl || room.videoUrl,
    provider: room.provider || 'direct',
    videoTitle: room.videoTitle || '',
    qualityMode: normalizeQualityMode(room.qualityMode),
    qualityOptions: normalizeQualityOptions(room.qualityOptions),
    playback: currentPlayback(room),
    members: publicMembers(room),
    roles: [...room.roles.values()],
    videoSuggestions: publicVideoSuggestions(room),
    passwordProtected: Boolean(room.passwordDigest),
    messages: room.messages,
  };
}
function normalizePlayback(payload) {
  const rawTime = Number(payload?.time);
  const rate = Number(payload?.rate);
  const sampledAt = payload?.sampledAt == null ? Number.NaN : Number(payload.sampledAt);
  const now = Date.now();
  const playing = Boolean(payload?.playing);
  const safeRate = Number.isFinite(rate) ? Math.min(2, Math.max(0.5, rate)) : 1;
  let time = Number.isFinite(rawTime) ? Math.max(0, rawTime) : 0;

  // sampledAt is calibrated to the server clock by the host. Compensate for
  // host -> server network time so viewers receive the point on the timeline
  // that is current at the server, not the slightly older client sample.
  if (playing && Number.isFinite(sampledAt)) {
    const transitSeconds = Math.max(0, Math.min(5, (now - sampledAt) / 1000));
    time += transitSeconds * safeRate;
  }

  return {
    playing,
    time,
    rate: safeRate,
    updatedAt: now,
  };
}
function roleNameFor(room, member) {
  if (!member?.roleId) return '';
  return room.roles.get(member.roleId)?.name || '';
}
function refreshMemberMessagesRole(room, memberId) {
  const member = room.members.get(memberId);
  const roleId = member?.roleId || null;
  const roleName = roleNameFor(room, member);
  for (const message of room.messages) {
    if (message.senderId === memberId) {
      message.roleId = roleId;
      message.roleName = roleName;
    }
  }
}
function isRoomAdmin(room, socket) {
  const key = socket?.data?.clientKey;
  return Boolean(key && room?.adminKeys?.has(key) && room.hostId !== socket.id);
}
function isRoomModerator(room, socket) {
  return Boolean(room && (room.hostId === socket.id || isRoomAdmin(room, socket)));
}
function refreshMemberMessagesAdmin(room, memberId) {
  const member = room.members.get(memberId);
  const isAdmin = Boolean(member?.clientKey && member.id !== room.hostId && room.adminKeys.has(member.clientKey));
  for (const message of room.messages) {
    if (message.senderId === memberId) message.isAdmin = isAdmin;
  }
}
function makeRoleId() {
  return `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
function emitRoom(io, roomId, room) {
  io.to(roomId).emit('room:state', publicRoom(room));
}
function leaveCurrentRoom(io, socket) {
  imageUploadStore.abort(socket.id);
  const roomId = socket.data.roomId;
  if (!roomId) return;
  const room = rooms.get(roomId);
  socket.leave(roomId);
  socket.data.roomId = null;
  if (!room) return;

  const leavingMember = room.members.get(socket.id);
  if (leavingMember?.clientKey) room.adminKeys.delete(leavingMember.clientKey);
  for (const message of room.messages) {
    if (message.senderId === socket.id) message.isAdmin = false;
  }
  room.members.delete(socket.id);
  socket.to(roomId).emit('chat:typing', { senderId: socket.id, senderName: socket.data.name || 'مهمان', typing: false });
  if (room.hostId === socket.id) {
    room.hostId = room.members.keys().next().value || null;
    const nextHost = room.hostId ? room.members.get(room.hostId) : null;
    if (nextHost?.clientKey) {
      room.adminKeys.delete(nextHost.clientKey);
      refreshMemberMessagesAdmin(room, nextHost.id);
    }
  }
  if (leavingMember && room.members.size) {
    emitModeratorPresence(io, roomId, room, {
      type: 'leave',
      memberId: leavingMember.id,
      memberName: leavingMember.name || 'مهمان',
      createdAt: Date.now(),
    }, leavingMember.id);
  }
  if (!room.members.size) {
    // An empty room must not keep its movie. Personal Saved Videos are stored
    // separately per browser profile and remain available across rooms.
    forgetRoomProgress(roomId, true);
    room.videoUrl = '';
    room.originalUrl = '';
    room.provider = 'direct';
    room.videoTitle = '';
    room.videoSources = [];
    room.qualityOptions = [];
    room.playback = { playing: false, time: 0, rate: 1, updatedAt: Date.now() };
    for (const message of room.messages || []) {
      if (message.imageUrl) deleteChatImage(message.imageUrl);
      if (message.audioUrl) deleteChatAudio(message.audioUrl);
    }
    room.messages = [];
    rooms.delete(roomId);
  } else emitRoom(io, roomId, room);
}


async function persistChatImageMessage(room, socket, { name, mime, buffer, caption, replyToId }) {
  if (!room || !room.members.has(socket.id)) return { ok: false, error: 'not-in-room' };
  if (!Buffer.isBuffer(buffer) || !buffer.length) return { ok: false, error: 'invalid-image' };
  if (buffer.length > CHAT_IMAGE_MAX_BYTES) return { ok: false, error: 'image-too-large', limit: CHAT_IMAGE_MAX_BYTES };
  if (chatUploadBytes + buffer.length > CHAT_UPLOAD_MAX_TOTAL_BYTES) return { ok: false, error: 'storage-busy' };

  const now = Date.now();
  fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
  const extension = safeImageExtension(name, mime);
  const filename = `${now}-${randomBytes(8).toString('hex')}${extension}`;
  const filepath = path.join(CHAT_UPLOAD_DIR, filename);

  try {
    await fs.promises.writeFile(filepath, buffer, { flag: 'wx', mode: 0o600 });
    await fs.promises.writeFile(`${filepath}.meta`, mime, { mode: 0o600 });
    chatUploadBytes += buffer.length;
  } catch (error) {
    fs.promises.unlink(filepath).catch(() => {});
    fs.promises.unlink(`${filepath}.meta`).catch(() => {});
    console.error('[chat:image]', error?.message || error);
    return { ok: false, error: 'upload-failed' };
  }

  const member = room.members.get(socket.id);
  const replyTo = buildReplySnapshot(room, replyToId);
  const message = {
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    senderId: socket.id,
    senderName: socket.data.name || 'مهمان',
    text: cleanText(caption),
    imageUrl: `${CHAT_UPLOAD_PREFIX}${filename}`,
    imageType: mime,
    imageName: String(name || 'image').slice(0, 120),
    mentions: [],
    replyTo,
    seen: false,
    createdAt: now,
    expiresAt: now + CHAT_TTL_MS,
    isHost: room.hostId === socket.id,
    isAdmin: isRoomAdmin(room, socket),
    roleId: member?.roleId || null,
    roleName: roleNameFor(room, member),
  };

  room.messages.push(message);
  while (room.messages.length > MESSAGE_LIMIT) {
    const removed = room.messages.shift();
    if (removed?.imageUrl) deleteChatImage(removed.imageUrl);
    if (removed?.audioUrl) deleteChatAudio(removed.audioUrl);
  }
  return { ok: true, message };
}

loadSavedProgress();
initializeUserSavedVideosStorage();

app.prepare().then(() => {
  let io = null;
  // Chat is intentionally non-persistent, so any temp media upload left from a previous process is orphaned.
  cleanupUploadDir({ purgeAll: true });
  const httpServer = createServer(async (req, res) => {
    const pathname = req.url?.split('?')[0] || '';
    if (req.method === 'POST' && pathname === '/api/room-leave') {
      try {
        const payload = await readSmallJson(req);
        const targetSocket = io?.sockets?.sockets?.get(String(payload?.socketId || ''));
        const roomId = cleanRoomId(payload?.roomId);
        if (targetSocket && roomId && targetSocket.data.roomId === roomId && safeTokenEquals(targetSocket.data.leaveToken, payload?.leaveToken)) {
          leaveCurrentRoom(io, targetSocket);
        }
        res.statusCode = 204;
        return res.end();
      } catch {
        res.statusCode = 400;
        return res.end('Bad request');
      }
    }
    if (req.method === 'GET' && req.url?.startsWith(CHAT_UPLOAD_PREFIX)) {
      const filepath = chatImagePathFromUrl(pathname);
      if (!filepath) { res.statusCode = 404; return res.end('Not found'); }
      fs.stat(filepath, (error, stat) => {
        if (error || !stat.isFile() || Date.now() - stat.mtimeMs >= CHAT_TTL_MS) {
          res.statusCode = 404;
          return res.end('Not found');
        }
        const metaPath = `${filepath}.meta`;
        fs.readFile(metaPath, 'utf8', (metaError, mime) => {
          const type = !metaError && safeImageType(mime) ? safeImageType(mime) : 'application/octet-stream';
          res.setHeader('Content-Type', type);
          res.setHeader('Cache-Control', 'private, max-age=300');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; img-src 'self' data: blob:");
          res.setHeader('Content-Length', stat.size);
          fs.createReadStream(filepath).pipe(res);
        });
      });
      return;
    }
    if (req.method === 'GET' && req.url?.startsWith(CHAT_AUDIO_PREFIX)) {
      const filepath = chatAudioPathFromUrl(pathname);
      if (!filepath) { res.statusCode = 404; return res.end('Not found'); }
      fs.stat(filepath, (error, stat) => {
        if (error || !stat.isFile() || Date.now() - stat.mtimeMs >= CHAT_TTL_MS) {
          res.statusCode = 404;
          return res.end('Not found');
        }
        fs.readFile(`${filepath}.meta`, 'utf8', (metaError, mime) => {
          const type = !metaError && safeAudioType(mime) ? safeAudioType(mime) : 'application/octet-stream';
          res.setHeader('Content-Type', type);
          res.setHeader('Cache-Control', 'private, max-age=300');
          res.setHeader('X-Content-Type-Options', 'nosniff');
          res.setHeader('Accept-Ranges', 'bytes');
          const range = String(req.headers.range || '');
          const match = range.match(/^bytes=(\d*)-(\d*)$/);
          if (match) {
            let start;
            let end;
            if (!match[1] && match[2]) {
              const suffixLength = Math.max(0, Number(match[2]));
              start = Math.max(0, stat.size - suffixLength);
              end = stat.size - 1;
            } else {
              start = match[1] ? Math.max(0, Number(match[1])) : 0;
              end = match[2] ? Math.min(stat.size - 1, Number(match[2])) : stat.size - 1;
            }
            if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= stat.size) {
              res.statusCode = 416;
              res.setHeader('Content-Range', `bytes */${stat.size}`);
              return res.end();
            }
            res.statusCode = 206;
            res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
            res.setHeader('Content-Length', end - start + 1);
            return fs.createReadStream(filepath, { start, end }).pipe(res);
          }
          res.setHeader('Content-Length', stat.size);
          fs.createReadStream(filepath).pipe(res);
        });
      });
      return;
    }
    handle(req, res);
  });
  io = new Server(httpServer, {
    // ParsPack WCDN reliably serves Engine.IO polling for this origin but can reject
    // WebSocket upgrades. Keep production realtime on polling to avoid noisy failed
    // wss upgrades while preserving Socket.IO reconnect/fallback semantics.
    transports: ['polling'],
    allowUpgrades: false,
    pingInterval: 25000,
    pingTimeout: 20000,
    maxHttpBufferSize: 9 * 1024 * 1024,
  });

  const cleanupTimer = setInterval(() => {
    cleanupUploadDir();
    imageUploadStore.cleanupExpired();
    const now = Date.now();
    for (const [roomId, room] of rooms) {
      const removedIds = pruneRoomMessages(room, now);
      if (removedIds.length) io.to(roomId).emit('chat:prune', { ids: removedIds });
    }
  }, 60 * 1000);
  cleanupTimer.unref?.();

  const progressMaintenanceTimer = setInterval(() => {
    const before = savedRoomProgress.size;
    pruneSavedProgress();
    if (savedRoomProgress.size !== before) scheduleSavedProgressFlush(250);
  }, 60 * 60 * 1000);
  progressMaintenanceTimer.unref?.();

  const flushActiveRooms = () => {
    try {
      for (const [roomId, room] of rooms) saveRoomProgress(roomId, room, { force: true });
      flushSavedProgressNow();
      flushUserSavedVideosNow();
    } catch (error) {
      console.error('[room-progress:shutdown]', error?.message || error);
    }
  };
  const handleShutdownSignal = () => {
    flushActiveRooms();
    process.exit(0);
  };
  process.once('SIGINT', handleShutdownSignal);
  process.once('SIGTERM', handleShutdownSignal);

  io.on('connection', (socket) => {
    if (io.engine.clientsCount > MAX_SOCKET_CONNECTIONS) {
      socket.emit('server:busy', { error: 'capacity' });
      socket.disconnect(true);
      return;
    }
    socket.data.actionWindows = new Map();
    socket.data.lastMessageAt = 0;
    socket.data.lastImageAt = 0;
    socket.data.lastVoiceAt = 0;
    socket.data.lastReactionAt = 0;
    socket.data.seenMessageIds = new Set();

    socket.on('clock:ping', (ack = () => {}) => {
      if (!allowSocketAction(socket, 'clock', 20, 10000)) return ack({ error: 'rate-limit' });
      ack({ serverNow: Date.now() });
    });

    socket.on('room:probe', ({ roomId }, ack = () => {}) => {
      if (!allowSocketAction(socket, 'room-probe', 20, 10000)) return ack({ ok: false, error: 'rate-limit' });
      roomId = cleanRoomId(roomId);
      if (!roomId) return ack({ ok: false, error: 'invalid-room' });
      const room = rooms.get(roomId);
      ack({ ok: true, exists: Boolean(room || recoverableRoomProgress(roomId)), passwordRequired: Boolean(room?.passwordDigest) });
    });

    socket.on('room:join', ({ roomId, name, clientKey, password }, ack = () => {}) => {
      if (!allowSocketAction(socket, 'room-join', 8, 15000)) return ack({ ok: false, error: 'rate-limit' });
      roomId = cleanRoomId(roomId);
      if (!roomId) return ack({ ok: false, error: 'invalid-room' });
      if (socket.data.roomId && socket.data.roomId !== roomId) leaveCurrentRoom(io, socket);

      const existingRoom = rooms.get(roomId);
      if (!existingRoom && rooms.size >= MAX_ACTIVE_ROOMS) return ack({ ok: false, error: 'server-busy' });
      if (existingRoom && !existingRoom.members.has(socket.id) && existingRoom.members.size >= MAX_ROOM_MEMBERS) return ack({ ok: false, error: 'room-full' });
      if (existingRoom?.passwordDigest && !passwordMatches(existingRoom.passwordDigest, password)) {
        return ack({ ok: false, error: cleanRoomPassword(password) ? 'invalid-password' : 'password-required', passwordRequired: true });
      }

      const room = existingRoom || getRoom(roomId);
      socket.join(roomId);
      socket.data.roomId = roomId;
      socket.data.name = cleanName(name);
      socket.data.clientKey = cleanClientKey(clientKey) || `socket_${socket.id}`;
      socket.data.leaveToken = randomBytes(18).toString('hex');
      const savedRoleId = room.roleAssignments.get(socket.data.clientKey) || null;
      room.members.set(socket.id, { id: socket.id, name: socket.data.name, clientKey: socket.data.clientKey, roleId: room.roles.has(savedRoleId) ? savedRoleId : null, joinedAt: Date.now() });
      if (!room.hostId) {
        room.hostId = socket.id;
        room.adminKeys.delete(socket.data.clientKey);
      }

      emitModeratorPresence(io, roomId, room, {
        type: 'join',
        memberId: socket.id,
        memberName: socket.data.name,
        createdAt: Date.now(),
      }, socket.id);

      ack({ ok: true, selfId: socket.id, leaveToken: socket.data.leaveToken, room: publicRoom(room) });
      emitRoom(io, roomId, room);

      if (room.restoreRefreshPending && room.originalUrl) {
        room.restoreRefreshPending = false;
        const expectedOriginalUrl = room.originalUrl;
        resolveMediaInput(expectedOriginalUrl, room.qualityMode).then((resolved) => {
          const activeRoom = rooms.get(roomId);
          if (!resolved?.ok || activeRoom !== room || activeRoom.originalUrl !== expectedOriginalUrl) return;
          const playback = currentPlayback(activeRoom);
          activeRoom.videoUrl = resolved.videoUrl;
          activeRoom.originalUrl = resolved.originalUrl;
          activeRoom.provider = resolved.provider;
          activeRoom.videoTitle = resolved.title || activeRoom.videoTitle;
          activeRoom.videoSources = resolved.videoSources || [];
          activeRoom.qualityOptions = normalizeQualityOptions(resolved.qualityOptions);
          activeRoom.playback = { ...playback, playing: false, updatedAt: Date.now() };
          saveRoomProgress(roomId, activeRoom, { force: true });
          io.to(roomId).emit('room:video', {
            videoUrl: activeRoom.videoUrl,
            originalUrl: activeRoom.originalUrl,
            provider: activeRoom.provider,
            videoTitle: activeRoom.videoTitle,
            qualityMode: normalizeQualityMode(activeRoom.qualityMode),
            qualityOptions: normalizeQualityOptions(activeRoom.qualityOptions),
            playback: activeRoom.playback,
          });
        }).catch((error) => console.warn('[room-progress:refresh]', error?.message || error));
      }
    });

    socket.on('room:leave', () => leaveCurrentRoom(io, socket));

    socket.on('saved-video:list', (ack = () => {}) => {
      if (!allowSocketAction(socket, 'saved-list', 20, 60000)) return ack({ ok: false, error: 'rate-limit' });
      const key = cleanClientKey(socket.data.clientKey);
      if (!key) return ack({ ok: false, error: 'profile-unavailable' });
      ack({ ok: true, items: getUserSavedVideos(key).map(publicSavedVideo) });
    });

    socket.on('saved-video:save', (ack = () => {}) => {
      if (!allowSocketAction(socket, 'saved-write', 20, 60000)) return ack({ ok: false, error: 'rate-limit' });
      const room = rooms.get(socket.data.roomId);
      if (!room || !room.members.has(socket.id)) return ack({ ok: false, error: 'not-in-room' });
      if (!isRoomModerator(room, socket)) return ack({ ok: false, error: 'forbidden' });
      if (!room.videoUrl || !room.originalUrl) return ack({ ok: false, error: 'no-video' });
      const item = saveVideoToUserProfile(socket.data.clientKey, room);
      if (!item) return ack({ ok: false, error: 'save-failed' });
      ack({ ok: true, item: publicSavedVideo(item), items: getUserSavedVideos(socket.data.clientKey).map(publicSavedVideo) });
    });

    socket.on('saved-video:delete', ({ id }, ack = () => {}) => {
      if (!allowSocketAction(socket, 'saved-write', 20, 60000)) return ack({ ok: false, error: 'rate-limit' });
      const key = cleanClientKey(socket.data.clientKey);
      if (!key) return ack({ ok: false, error: 'profile-unavailable' });
      const deleted = deleteUserSavedVideo(key, id);
      ack({ ok: deleted, error: deleted ? undefined : 'not-found', items: getUserSavedVideos(key).map(publicSavedVideo) });
    });

    socket.on('saved-video:use', async ({ id }, ack = () => {}) => {
      if (!allowSocketAction(socket, 'saved-use', 10, 60000)) return ack({ ok: false, error: 'rate-limit' });
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || !room.members.has(socket.id)) return ack({ ok: false, error: 'not-in-room' });
      if (!isRoomModerator(room, socket)) return ack({ ok: false, error: 'forbidden' });
      const item = getUserSavedVideos(socket.data.clientKey).find(entry => entry.id === cleanMessageId(id));
      if (!item) return ack({ ok: false, error: 'not-found' });

      const resolved = await resolveMediaInput(item.originalUrl, item.qualityMode || room.qualityMode);
      if (!resolved.ok) return ack({ ok: false, error: resolved.error || 'resolve-failed' });

      room.videoUrl = resolved.videoUrl;
      room.originalUrl = resolved.originalUrl;
      room.provider = resolved.provider;
      room.videoTitle = resolved.title || item.videoTitle || '';
      room.videoSources = resolved.videoSources || [];
      room.qualityOptions = normalizeQualityOptions(resolved.qualityOptions);
      room.qualityMode = normalizeQualityMode(item.qualityMode || room.qualityMode);
      room.playback = {
        playing: false,
        time: Math.max(0, Number(item.time) || 0),
        rate: Math.max(0.5, Math.min(2, Number(item.rate) || 1)),
        updatedAt: Date.now(),
      };
      saveRoomProgress(roomId, room, { force: true });
      io.to(roomId).emit('room:video', {
        videoUrl: room.videoUrl,
        originalUrl: room.originalUrl,
        provider: room.provider,
        videoTitle: room.videoTitle,
        qualityMode: normalizeQualityMode(room.qualityMode),
        qualityOptions: normalizeQualityOptions(room.qualityOptions),
        playback: room.playback,
      });
      ack({ ok: true, item: publicSavedVideo(item) });
    });

    socket.on('room:set-password', ({ password }, ack = () => {}) => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || room.hostId !== socket.id) return ack({ ok: false, error: 'forbidden' });
      const cleanPassword = cleanRoomPassword(password);
      if (cleanPassword && cleanPassword.length < 4) return ack({ ok: false, error: 'too-short' });
      room.passwordDigest = cleanPassword ? passwordDigest(cleanPassword) : null;
      emitRoom(io, roomId, room);
      ack({ ok: true, passwordProtected: Boolean(room.passwordDigest) });
    });

    socket.on('room:set-admin', ({ memberId, admin }, ack = () => {}) => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || room.hostId !== socket.id) return ack({ ok: false, error: 'forbidden' });

      const target = room.members.get(String(memberId || ''));
      if (!target) return ack({ ok: false, error: 'member-not-found' });
      if (target.id === room.hostId) return ack({ ok: false, error: 'host-cannot-be-admin' });
      if (!target.clientKey) return ack({ ok: false, error: 'member-key-missing' });

      const shouldAdmin = Boolean(admin);
      const alreadyAdmin = room.adminKeys.has(target.clientKey);
      if (shouldAdmin && !alreadyAdmin && room.adminKeys.size >= ADMIN_LIMIT) {
        return ack({ ok: false, error: 'admin-limit', limit: ADMIN_LIMIT });
      }

      if (shouldAdmin) room.adminKeys.add(target.clientKey);
      else room.adminKeys.delete(target.clientKey);
      refreshMemberMessagesAdmin(room, target.id);
      emitRoom(io, roomId, room);
      ack({ ok: true, isAdmin: shouldAdmin, adminCount: room.adminKeys.size, limit: ADMIN_LIMIT });
    });

    socket.on('room:kick', ({ memberId }, ack = () => {}) => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || !isRoomModerator(room, socket)) return ack({ ok: false, error: 'forbidden' });

      const target = room.members.get(String(memberId || ''));
      if (!target) return ack({ ok: false, error: 'member-not-found' });
      if (target.id === socket.id) return ack({ ok: false, error: 'cannot-kick-self' });
      if (target.id === room.hostId) return ack({ ok: false, error: 'cannot-kick-host' });

      const actorIsHost = room.hostId === socket.id;
      const targetIsAdmin = Boolean(target.clientKey && room.adminKeys.has(target.clientKey));
      if (!actorIsHost && targetIsAdmin) return ack({ ok: false, error: 'cannot-kick-admin' });

      const targetSocket = io.sockets.sockets.get(target.id);
      if (target.clientKey) room.adminKeys.delete(target.clientKey);
      for (const message of room.messages) {
        if (message.senderId === target.id) message.isAdmin = false;
      }
      room.members.delete(target.id);
      socket.to(roomId).emit('chat:typing', { senderId: target.id, senderName: target.name || 'مهمان', typing: false });
      emitModeratorPresence(io, roomId, room, {
        type: 'leave',
        memberId: target.id,
        memberName: target.name || 'مهمان',
        createdAt: Date.now(),
      }, socket.id);

      if (targetSocket) {
        targetSocket.leave(roomId);
        targetSocket.data.roomId = null;
        targetSocket.emit('room:kicked', { roomId, byName: socket.data.name || 'مدیر اتاق' });
      }

      emitRoom(io, roomId, room);
      ack({ ok: true });
    });

    socket.on('room:set-video', async ({ url }, ack = () => {}) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.hostId !== socket.id) return ack({ ok: false, error: 'forbidden' });

      const resolved = await resolveMediaInput(url, room.qualityMode);
      if (!resolved.ok) return ack({ ok: false, error: resolved.error });

      room.videoUrl = resolved.videoUrl;
      room.originalUrl = resolved.originalUrl;
      room.provider = resolved.provider;
      room.videoTitle = resolved.title;
      room.videoSources = resolved.videoSources || [];
      room.qualityOptions = normalizeQualityOptions(resolved.qualityOptions);
      room.playback = { playing: false, time: 0, rate: 1, updatedAt: Date.now() };
      saveRoomProgress(socket.data.roomId, room, { force: true });
      io.to(socket.data.roomId).emit('room:video', {
        videoUrl: room.videoUrl,
        originalUrl: room.originalUrl,
        provider: room.provider,
        videoTitle: room.videoTitle,
        qualityMode: normalizeQualityMode(room.qualityMode),
        qualityOptions: normalizeQualityOptions(room.qualityOptions),
        playback: room.playback,
      });
      ack({ ok: true, provider: resolved.provider, title: resolved.title });
    });

    socket.on('room:clear-video', (ack = () => {}) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.hostId !== socket.id) return ack({ ok: false, error: 'forbidden' });

      room.videoUrl = '';
      room.originalUrl = '';
      room.provider = 'direct';
      room.videoTitle = '';
      room.videoSources = [];
      room.qualityOptions = [];
      room.playback = { playing: false, time: 0, rate: 1, updatedAt: Date.now() };
      forgetRoomProgress(socket.data.roomId, true);

      io.to(socket.data.roomId).emit('room:video', {
        videoUrl: '',
        originalUrl: '',
        provider: 'direct',
        videoTitle: '',
        qualityMode: normalizeQualityMode(room.qualityMode),
        qualityOptions: [],
        playback: room.playback,
      });
      ack({ ok: true });
    });


    socket.on('room:set-quality', ({ mode }, ack = () => {}) => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || !isRoomModerator(room, socket)) return ack({ ok: false, error: 'forbidden' });

      const qualityMode = normalizeQualityMode(mode);
      const requestedHeight = qualityModeHeight(qualityMode);
      const availableQualities = normalizeQualityOptions(room.qualityOptions);
      if (requestedHeight && availableQualities.length && !availableQualities.includes(requestedHeight)) {
        return ack({ ok: false, error: 'quality-unavailable', qualityOptions: availableQualities });
      }
      const playback = currentPlayback(room);
      room.qualityMode = qualityMode;
      room.playback = playback;

      const selected = selectQualitySource(room.videoSources, qualityMode);
      if (selected?.url && selected.url !== room.videoUrl) room.videoUrl = selected.url;
      saveRoomProgress(roomId, room, { force: true });

      const qualityPayload = {
        qualityMode,
        qualityOptions: normalizeQualityOptions(room.qualityOptions),
        videoUrl: room.videoUrl,
        playback: room.playback,
      };
      io.to(roomId).emit('room:quality', qualityPayload);
      emitRoom(io, roomId, room);
      ack({ ok: true, ...qualityPayload });
    });

    socket.on('room:report-quality-options', ({ options }, ack = () => {}) => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || room.hostId !== socket.id) return ack({ ok: false, error: 'forbidden' });

      const qualityOptions = normalizeQualityOptions(options);
      if (!qualityOptions.length) return ack({ ok: false, error: 'invalid-options' });
      room.qualityOptions = qualityOptions;
      emitRoom(io, roomId, room);
      ack({ ok: true, qualityOptions });
    });

    socket.on('video:suggest', ({ url }, ack = () => {}) => {
      if (!allowSocketAction(socket, 'video-suggest', 20, 60000)) return ack({ ok: false, error: 'rate-limit' });
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room) return ack({ ok: false, error: 'room-not-found' });
      if (room.hostId === socket.id) return ack({ ok: false, error: 'host-cannot-suggest' });
      if (!room.hostId) return ack({ ok: false, error: 'host-offline' });

      const cleanUrl = validMediaUrl(url);
      if (!cleanUrl) return ack({ ok: false, error: 'invalid-url' });

      const clientKey = socket.data.clientKey || `socket_${socket.id}`;
      const now = Date.now();
      const lastAt = Number(room.videoSuggestionCooldowns.get(clientKey) || 0);
      const cooldownMs = 5_000;
      const remaining = cooldownMs - (now - lastAt);
      if (remaining > 0) return ack({ ok: false, error: 'cooldown', retryAfterMs: remaining });

      if ((room.videoSuggestions || []).some(item => item.senderKey === clientKey && item.url === cleanUrl)) {
        return ack({ ok: false, error: 'duplicate' });
      }

      const suggestion = {
        id: `vs_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        url: cleanUrl,
        senderId: socket.id,
        senderKey: clientKey,
        senderName: socket.data.name || 'مهمان',
        createdAt: now,
      };
      room.videoSuggestionCooldowns.set(clientKey, now);
      room.videoSuggestions = [...(room.videoSuggestions || []), suggestion].slice(-VIDEO_SUGGESTION_LIMIT);
      const hostSocket = io.sockets.sockets.get(room.hostId);
      hostSocket?.emit('video:suggestion:new', suggestion);
      emitRoom(io, roomId, room);
      ack({ ok: true, cooldownMs });
    });

    socket.on('video:suggestion-remove', ({ suggestionId }, ack = () => {}) => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || room.hostId !== socket.id) return ack({ ok: false, error: 'forbidden' });
      const before = (room.videoSuggestions || []).length;
      room.videoSuggestions = (room.videoSuggestions || []).filter(item => item.id !== String(suggestionId || ''));
      if (room.videoSuggestions.length === before) return ack({ ok: false, error: 'not-found' });
      emitRoom(io, roomId, room);
      ack({ ok: true });
    });

    socket.on('video:suggestion-accept', async ({ suggestionId }, ack = () => {}) => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || room.hostId !== socket.id) return ack({ ok: false, error: 'forbidden' });
      const suggestion = (room.videoSuggestions || []).find(item => item.id === String(suggestionId || ''));
      if (!suggestion) return ack({ ok: false, error: 'not-found' });

      const resolved = await resolveMediaInput(suggestion.url, room.qualityMode);
      if (!resolved.ok) return ack({ ok: false, error: resolved.error });

      room.videoUrl = resolved.videoUrl;
      room.originalUrl = resolved.originalUrl;
      room.provider = resolved.provider;
      room.videoTitle = resolved.title;
      room.videoSources = resolved.videoSources || [];
      room.qualityOptions = normalizeQualityOptions(resolved.qualityOptions);
      room.playback = { playing: false, time: 0, rate: 1, updatedAt: Date.now() };
      room.videoSuggestions = (room.videoSuggestions || []).filter(item => item.id !== suggestion.id);
      saveRoomProgress(roomId, room, { force: true });

      io.to(roomId).emit('room:video', {
        videoUrl: room.videoUrl,
        originalUrl: room.originalUrl,
        provider: room.provider,
        videoTitle: room.videoTitle,
        qualityMode: normalizeQualityMode(room.qualityMode),
        qualityOptions: normalizeQualityOptions(room.qualityOptions),
        playback: room.playback,
      });
      emitRoom(io, roomId, room);
      ack({ ok: true, provider: resolved.provider, title: resolved.title });
    });

    socket.on('playback:update', (payload) => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || room.hostId !== socket.id) return;
      room.playback = normalizePlayback(payload);
      // RAM snapshots are throttled and disk flushes are globally debounced.
      // Pauses are captured immediately in memory; final room exit flushes synchronously.
      saveRoomProgress(roomId, room, { force: !room.playback.playing, immediate: !room.playback.playing });
      socket.to(roomId).emit('playback:sync', room.playback);
    });

    socket.on('playback:request-sync', () => {
      const room = rooms.get(socket.data.roomId);
      if (!room) return;
      socket.emit('playback:sync', currentPlayback(room));
    });

    socket.on('playback:request-action', ({ action }, ack = () => {}) => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room) return ack({ ok: false, error: 'room-not-found' });
      if (room.hostId === socket.id) return ack({ ok: false, error: 'host-cannot-request' });
      if (!['play', 'pause'].includes(action)) return ack({ ok: false, error: 'invalid-action' });
      if (!room.hostId) return ack({ ok: false, error: 'host-offline' });

      const clientKey = socket.data.clientKey || `socket_${socket.id}`;
      const now = Date.now();
      const lastAt = Number(room.playbackRequestCooldowns.get(clientKey) || 0);
      const cooldownMs = 10_000;
      const remaining = cooldownMs - (now - lastAt);
      if (remaining > 0) {
        return ack({ ok: false, error: 'cooldown', retryAfterMs: remaining });
      }

      const hostSocket = io.sockets.sockets.get(room.hostId);
      if (!hostSocket) return ack({ ok: false, error: 'host-offline' });

      room.playbackRequestCooldowns.set(clientKey, now);
      hostSocket.emit('playback:action-request', {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        action,
        requesterId: socket.id,
        requesterName: socket.data.name || 'مهمان',
        createdAt: now,
      });
      ack({ ok: true, cooldownMs });
    });

    socket.on('chat:typing', ({ typing }) => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || !room.members.has(socket.id)) return;
      socket.to(roomId).emit('chat:typing', {
        senderId: socket.id,
        senderName: socket.data.name || 'مهمان',
        typing: Boolean(typing),
      });
    });

    socket.on('chat:send', ({ text, mentionIds, replyToId }, ack = () => {}) => {
      const room = rooms.get(socket.data.roomId);
      if (!room) return ack({ ok: false });
      const now = Date.now();
      if (now - socket.data.lastMessageAt < 350) return ack({ ok: false, error: 'rate-limit' });
      socket.data.lastMessageAt = now;
      text = cleanText(text);
      if (!text) return ack({ ok: false });
      const mentions = buildMentionSnapshots(room, mentionIds, text);
      const replyTo = buildReplySnapshot(room, replyToId);
      const message = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        senderId: socket.id,
        senderName: socket.data.name || 'مهمان',
        text,
        mentions,
        replyTo,
        seen: false,
        createdAt: now,
        expiresAt: now + CHAT_TTL_MS,
        isHost: room.hostId === socket.id,
        isAdmin: isRoomAdmin(room, socket),
        roleId: room.members.get(socket.id)?.roleId || null,
        roleName: roleNameFor(room, room.members.get(socket.id)),
      };
      room.messages.push(message);
      while (room.messages.length > MESSAGE_LIMIT) {
        const removed = room.messages.shift();
        if (removed?.imageUrl) deleteChatImage(removed.imageUrl);
        if (removed?.audioUrl) deleteChatAudio(removed.audioUrl);
      }
      io.to(socket.data.roomId).emit('chat:message', message);
      ack({ ok: true });
    });

    socket.on('chat:image:start', ({ name, type, size, caption, replyToId }, ack = () => {}) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || !room.members.has(socket.id)) return ack({ ok: false, error: 'not-in-room' });
      const now = Date.now();
      if (now - socket.data.lastImageAt < 3000) return ack({ ok: false, error: 'rate-limit' });

      const mime = safeImageType(type, name);
      const declaredSize = Number(size);
      if (!mime) return ack({ ok: false, error: 'invalid-image-type' });
      if (!Number.isFinite(declaredSize) || declaredSize <= 0 || declaredSize > CHAT_IMAGE_MAX_BYTES) {
        return ack({ ok: false, error: 'image-too-large', limit: CHAT_IMAGE_MAX_BYTES });
      }
      if (chatUploadBytes + declaredSize > CHAT_UPLOAD_MAX_TOTAL_BYTES) return ack({ ok: false, error: 'storage-busy' });

      const started = imageUploadStore.start(socket.id, {
        roomId: socket.data.roomId,
        name: String(name || 'image').slice(0, 120),
        mime,
        size: declaredSize,
        caption: cleanText(caption),
        replyToId: cleanMessageId(replyToId),
      });
      if (started.ok) socket.data.lastImageAt = now;
      ack(started);
    });

    socket.on('chat:image:abort', () => {
      imageUploadStore.abort(socket.id);
    });

    socket.on('chat:image:chunk', async ({ uploadId, index, data, final }, ack = () => {}) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || !room.members.has(socket.id)) {
        imageUploadStore.abort(socket.id);
        return ack({ ok: false, error: 'not-in-room' });
      }

      const chunk = imageUploadStore.append(socket.id, { uploadId, index, data, final });
      if (!chunk.ok || !chunk.done) return ack(chunk);
      if (chunk.metadata.roomId !== socket.data.roomId) return ack({ ok: false, error: 'not-in-room' });

      const stored = await persistChatImageMessage(room, socket, {
        name: chunk.metadata.name,
        mime: chunk.metadata.mime,
        buffer: chunk.buffer,
        caption: chunk.metadata.caption,
        replyToId: chunk.metadata.replyToId,
      });
      if (!stored.ok) return ack(stored);
      io.to(socket.data.roomId).emit('chat:message', stored.message);
      ack({ ok: true, done: true, messageId: stored.message.id });
    });

    // Backward compatibility for older clients. New clients use chunked image upload
    // so reverse proxies with a 1 MB request-body limit do not stall camera/gallery sends.
    socket.on('chat:image', async ({ name, type, size, data, caption, replyToId }, ack = () => {}) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || !room.members.has(socket.id)) return ack({ ok: false, error: 'not-in-room' });
      const now = Date.now();
      if (now - socket.data.lastImageAt < 3000) return ack({ ok: false, error: 'rate-limit' });
      const mime = safeImageType(type, name);
      const declaredSize = Number(size);
      if (!mime) return ack({ ok: false, error: 'invalid-image-type' });
      let buffer;
      try { buffer = Buffer.isBuffer(data) ? data : Buffer.from(data); } catch { return ack({ ok: false, error: 'invalid-image' }); }
      if (!buffer.length || buffer.length > CHAT_IMAGE_MAX_BYTES || (Number.isFinite(declaredSize) && declaredSize > CHAT_IMAGE_MAX_BYTES)) {
        return ack({ ok: false, error: 'image-too-large', limit: CHAT_IMAGE_MAX_BYTES });
      }
      socket.data.lastImageAt = now;
      const stored = await persistChatImageMessage(room, socket, { name, mime, buffer, caption, replyToId });
      if (!stored.ok) return ack(stored);
      io.to(socket.data.roomId).emit('chat:message', stored.message);
      ack({ ok: true, messageId: stored.message.id });
    });

    socket.on('chat:voice', ({ type, size, data, durationMs, replyToId }, ack = () => {}) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || !room.members.has(socket.id)) return ack({ ok: false, error: 'not-in-room' });
      const now = Date.now();
      if (now - socket.data.lastVoiceAt < 1200) return ack({ ok: false, error: 'rate-limit' });
      const mime = safeAudioType(type);
      const declaredSize = Number(size);
      const safeDurationMs = Math.max(0, Math.min(CHAT_VOICE_MAX_MS, Number(durationMs) || 0));
      if (!mime) return ack({ ok: false, error: 'invalid-audio-type' });
      if (safeDurationMs < 250) return ack({ ok: false, error: 'audio-too-short' });
      let buffer;
      try { buffer = Buffer.isBuffer(data) ? data : Buffer.from(data); } catch { return ack({ ok: false, error: 'invalid-audio' }); }
      if (!buffer.length || buffer.length > CHAT_AUDIO_MAX_BYTES || (Number.isFinite(declaredSize) && declaredSize > CHAT_AUDIO_MAX_BYTES)) {
        return ack({ ok: false, error: 'audio-too-large', limit: CHAT_AUDIO_MAX_BYTES });
      }
      if (chatUploadBytes + buffer.length > CHAT_UPLOAD_MAX_TOTAL_BYTES) return ack({ ok: false, error: 'storage-busy' });
      socket.data.lastVoiceAt = now;
      fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });
      const filename = `${now}-${randomBytes(8).toString('hex')}${safeAudioExtension(mime)}`;
      const filepath = path.join(CHAT_UPLOAD_DIR, filename);
      try {
        fs.writeFileSync(filepath, buffer, { flag: 'wx', mode: 0o600 });
        fs.writeFileSync(`${filepath}.meta`, mime, { mode: 0o600 });
        chatUploadBytes += buffer.length;
      } catch (error) {
        console.error('[chat:voice]', error?.message || error);
        return ack({ ok: false, error: 'upload-failed' });
      }
      const member = room.members.get(socket.id);
      const replyTo = buildReplySnapshot(room, replyToId);
      const message = {
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        senderId: socket.id,
        senderName: socket.data.name || 'مهمان',
        text: '',
        audioUrl: `${CHAT_AUDIO_PREFIX}${filename}`,
        audioType: mime,
        audioDurationMs: safeDurationMs,
        mentions: [],
        replyTo,
        seen: false,
        createdAt: now,
        expiresAt: now + CHAT_TTL_MS,
        isHost: room.hostId === socket.id,
        isAdmin: isRoomAdmin(room, socket),
        roleId: member?.roleId || null,
        roleName: roleNameFor(room, member),
      };
      room.messages.push(message);
      while (room.messages.length > MESSAGE_LIMIT) {
        const removed = room.messages.shift();
        if (removed?.imageUrl) deleteChatImage(removed.imageUrl);
        if (removed?.audioUrl) deleteChatAudio(removed.audioUrl);
      }
      io.to(socket.data.roomId).emit('chat:message', message);
      ack({ ok: true, messageId: message.id, expiresAt: message.expiresAt });
    });

    socket.on('chat:delete', ({ messageId }, ack = () => {}) => {
      if (!allowSocketAction(socket, 'chat-delete', 30, 60000)) return ack({ ok: false, error: 'rate-limit' });
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || !room.members.has(socket.id)) return ack({ ok: false, error: 'not-in-room' });
      if (!isRoomModerator(room, socket)) return ack({ ok: false, error: 'forbidden' });
      const id = cleanMessageId(messageId);
      const index = room.messages.findIndex(message => message.id === id);
      if (index < 0) return ack({ ok: false, error: 'not-found' });
      const [removed] = room.messages.splice(index, 1);
      if (removed?.imageUrl) deleteChatImage(removed.imageUrl);
      if (removed?.audioUrl) deleteChatAudio(removed.audioUrl);
      io.to(roomId).emit('chat:deleted', { id });
      ack({ ok: true, id });
    });

    socket.on('chat:seen', ({ messageIds }, ack = () => {}) => {
      const roomId = socket.data.roomId;
      const room = rooms.get(roomId);
      if (!room || !room.members.has(socket.id)) return ack({ ok: false, error: 'not-in-room' });
      const ids = Array.isArray(messageIds) ? messageIds.map(cleanMessageId).filter(Boolean).slice(0, 50) : [];
      const changed = [];
      for (const id of ids) {
        if (socket.data.seenMessageIds.has(id)) continue;
        const message = room.messages.find(item => item.id === id);
        if (!message || message.senderId === socket.id) continue;
        socket.data.seenMessageIds.add(id);
        if (!message.seen) {
          message.seen = true;
          changed.push(id);
        }
      }
      if (changed.length) io.to(roomId).emit('chat:seen', { ids: changed });
      ack({ ok: true, ids: changed });
    });

    socket.on('role:create', ({ name, memberId, emoji, color }, ack = () => {}) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || !room.members.has(socket.id)) return ack({ ok: false, error: 'not-in-room' });
      const requestedMemberId = String(memberId || '');
      const canEditTarget = room.hostId === socket.id || requestedMemberId === socket.id;
      if (!canEditTarget) return ack({ ok: false, error: 'forbidden' });
      name = cleanRoleName(name);
      emoji = cleanRoleEmoji(emoji);
      color = cleanRoleColor(color);
      if (!name) return ack({ ok: false, error: 'invalid-role' });
      const target = room.members.get(requestedMemberId);
      if (!target) return ack({ ok: false, error: 'member-not-found' });

      let role = [...room.roles.values()].find((item) => item.name.toLocaleLowerCase('fa') === name.toLocaleLowerCase('fa'));
      if (!role) {
        if (room.roles.size >= ROLE_LIMIT) return ack({ ok: false, error: 'role-limit' });
        role = { id: makeRoleId(), name, emoji, color, createdAt: Date.now() };
        room.roles.set(role.id, role);
      }

      target.roleId = role.id;
      const targetSocket = io.sockets.sockets.get(target.id);
      const targetKey = targetSocket?.data?.clientKey;
      if (targetKey) room.roleAssignments.set(targetKey, role.id);
      refreshMemberMessagesRole(room, target.id);
      emitRoom(io, socket.data.roomId, room);
      ack({ ok: true, role });
    });

    socket.on('role:assign', ({ memberId, roleId }, ack = () => {}) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || !room.members.has(socket.id)) return ack({ ok: false, error: 'not-in-room' });
      const requestedMemberId = String(memberId || '');
      const canEditTarget = room.hostId === socket.id || requestedMemberId === socket.id;
      if (!canEditTarget) return ack({ ok: false, error: 'forbidden' });
      const target = room.members.get(requestedMemberId);
      if (!target) return ack({ ok: false, error: 'member-not-found' });
      const nextRoleId = roleId ? String(roleId) : null;
      if (nextRoleId && !room.roles.has(nextRoleId)) return ack({ ok: false, error: 'role-not-found' });

      target.roleId = nextRoleId;
      const targetSocket = io.sockets.sockets.get(target.id);
      const targetKey = targetSocket?.data?.clientKey;
      if (targetKey) {
        if (nextRoleId) room.roleAssignments.set(targetKey, nextRoleId);
        else room.roleAssignments.delete(targetKey);
      }
      refreshMemberMessagesRole(room, target.id);
      emitRoom(io, socket.data.roomId, room);
      ack({ ok: true });
    });

    socket.on('role:delete', ({ roleId }, ack = () => {}) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || room.hostId !== socket.id) return ack({ ok: false, error: 'forbidden' });
      roleId = String(roleId || '');
      if (!room.roles.has(roleId)) return ack({ ok: false, error: 'role-not-found' });
      room.roles.delete(roleId);
      for (const [key, assignedRoleId] of room.roleAssignments) {
        if (assignedRoleId === roleId) room.roleAssignments.delete(key);
      }
      for (const member of room.members.values()) {
        if (member.roleId === roleId) member.roleId = null;
      }
      for (const message of room.messages) {
        if (message.roleId === roleId) { message.roleId = null; message.roleName = ''; }
      }
      emitRoom(io, socket.data.roomId, room);
      ack({ ok: true });
    });

    socket.on('reaction:send', ({ emoji }) => {
      const room = rooms.get(socket.data.roomId);
      if (!room || !ALLOWED_REACTIONS.has(emoji)) return;
      const now = Date.now();
      if (now - socket.data.lastReactionAt < 220) return;
      socket.data.lastReactionAt = now;
      io.to(socket.data.roomId).emit('reaction:show', {
        id: `${now}-${Math.random().toString(36).slice(2, 9)}`,
        emoji,
        senderName: socket.data.name || 'مهمان',
      });
    });

    socket.on('disconnecting', () => leaveCurrentRoom(io, socket));
    socket.on('disconnect', () => leaveCurrentRoom(io, socket));
  });

  httpServer.listen(port, hostname, () => {
    console.log(`> Baham Bebinim ready on http://${hostname}:${port}`);
  });
});
