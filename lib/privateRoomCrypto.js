const KEY_BYTES = 32;
const IV_BYTES = 12;
const keyCache = new Map();

function bytesToBase64Url(bytes) {
  let binary = '';
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function normalizeRoomCryptoKey(value) {
  try {
    const clean = String(value || '').trim();
    if (!clean) return '';
    const bytes = base64UrlToBytes(clean);
    return bytes.length === KEY_BYTES ? bytesToBase64Url(bytes) : '';
  } catch {
    return '';
  }
}

export function extractRoomCryptoKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    if (/^https?:\/\//i.test(raw)) {
      const url = new URL(raw);
      const params = new URLSearchParams(url.hash.replace(/^#/, ''));
      return normalizeRoomCryptoKey(params.get('k') || params.get('key') || '');
    }
  } catch {}
  if (raw.startsWith('#')) {
    const params = new URLSearchParams(raw.replace(/^#/, ''));
    return normalizeRoomCryptoKey(params.get('k') || params.get('key') || '');
  }
  return normalizeRoomCryptoKey(raw);
}

function storageKey(roomId) {
  return `baham-bebinim-room-key:${String(roomId || '').trim().toUpperCase()}`;
}

export function readRoomCryptoKey(roomId) {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const fromHash = normalizeRoomCryptoKey(params.get('k') || params.get('key') || '');
    if (fromHash) {
      try { localStorage.setItem(storageKey(roomId), fromHash); } catch {}
      return fromHash;
    }
  } catch {}
  try { return normalizeRoomCryptoKey(localStorage.getItem(storageKey(roomId)) || ''); }
  catch { return ''; }
}

export function persistRoomCryptoKey(roomId, keyString, { updateHash = true } = {}) {
  const key = normalizeRoomCryptoKey(keyString);
  if (!key || typeof window === 'undefined') return '';
  try { localStorage.setItem(storageKey(roomId), key); } catch {}
  if (updateHash) {
    try {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.hash.replace(/^#/, ''));
      params.set('k', key);
      url.hash = params.toString();
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {}
  }
  return key;
}


export function clearRoomCryptoKey(roomId, { updateHash = true } = {}) {
  if (typeof window === 'undefined') return;
  try { localStorage.removeItem(storageKey(roomId)); } catch {}
  if (updateHash) {
    try {
      const url = new URL(window.location.href);
      const params = new URLSearchParams(url.hash.replace(/^#/, ''));
      params.delete('k');
      params.delete('key');
      url.hash = params.toString();
      const next = `${url.pathname}${url.search}${url.hash ? `#${url.hash.replace(/^#/, '')}` : ''}`;
      window.history.replaceState(window.history.state, '', next);
    } catch {}
  }
}

export function generateRoomCryptoKey(roomId) {
  if (typeof crypto === 'undefined' || !crypto.getRandomValues) return '';
  const bytes = crypto.getRandomValues(new Uint8Array(KEY_BYTES));
  return persistRoomCryptoKey(roomId, bytesToBase64Url(bytes));
}

export function privateInviteUrl(roomId, keyString) {
  const key = normalizeRoomCryptoKey(keyString);
  if (!key || typeof window === 'undefined') return '';
  const url = new URL(window.location.href);
  url.pathname = `/room/${encodeURIComponent(String(roomId || '').trim())}`;
  url.search = '';
  url.hash = `k=${encodeURIComponent(key)}`;
  return url.toString();
}

async function importAesKey(keyString) {
  const normalized = normalizeRoomCryptoKey(keyString);
  if (!normalized) throw Object.assign(new Error('missing-private-key'), { code: 'missing-private-key' });
  if (keyCache.has(normalized)) return keyCache.get(normalized);
  const key = await crypto.subtle.importKey('raw', base64UrlToBytes(normalized), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  keyCache.set(normalized, key);
  return key;
}

export async function encryptPrivateJson(keyString, value) {
  const key = await importAesKey(keyString);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const plain = new TextEncoder().encode(JSON.stringify(value ?? {}));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return { v: 1, iv: bytesToBase64Url(iv), data: bytesToBase64Url(new Uint8Array(encrypted)) };
}

export async function decryptPrivateJson(keyString, envelope) {
  if (!envelope || Number(envelope.v) !== 1) throw new Error('invalid-private-envelope');
  const key = await importAesKey(keyString);
  const iv = base64UrlToBytes(envelope.iv);
  const data = base64UrlToBytes(envelope.data);
  if (iv.length !== IV_BYTES || !data.length) throw new Error('invalid-private-envelope');
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

export async function encryptPrivateBytes(keyString, arrayBuffer) {
  const key = await importAesKey(keyString);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, arrayBuffer);
  return {
    descriptor: { v: 1, iv: bytesToBase64Url(iv) },
    data: encrypted,
  };
}

export async function decryptPrivateBytes(keyString, descriptor, encryptedBytes) {
  if (!descriptor || Number(descriptor.v) !== 1) throw new Error('invalid-private-media');
  const key = await importAesKey(keyString);
  const iv = base64UrlToBytes(descriptor.iv);
  if (iv.length !== IV_BYTES) throw new Error('invalid-private-media');
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encryptedBytes);
}
