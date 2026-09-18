import { emitWithAckTimeout } from '@/lib/socketAck';
import { encryptPrivateBytes, encryptPrivateJson } from '@/lib/privateRoomCrypto';

export const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const CHAT_AUDIO_MAX_BYTES = 8 * 1024 * 1024;
export const CHAT_VOICE_MAX_MS = 5 * 60 * 1000;
const MEDIA_UPLOAD_TIMEOUT_MS = 18000;
const IMAGE_HEADER_BYTES = 64;

function ascii(bytes, offset, value) {
  if (!bytes || offset < 0 || offset + value.length > bytes.length) return false;
  for (let i = 0; i < value.length; i += 1) if (bytes[offset + i] !== value.charCodeAt(i)) return false;
  return true;
}

export function detectImageMimeFromBytes(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || 0);
  if (view.length < 4) return '';
  if (view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff) return 'image/jpeg';
  if (view.length >= 8 && [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((v,i)=>view[i]===v)) return 'image/png';
  if (ascii(view,0,'GIF87a') || ascii(view,0,'GIF89a')) return 'image/gif';
  if (ascii(view,0,'RIFF') && ascii(view,8,'WEBP')) return 'image/webp';
  if (view[0] === 0x42 && view[1] === 0x4d) return 'image/bmp';
  if ((view[0]===0x49&&view[1]===0x49&&view[2]===0x2a&&view[3]===0x00)||(view[0]===0x4d&&view[1]===0x4d&&view[2]===0x00&&view[3]===0x2a)) return 'image/tiff';
  if (view[0]===0x00&&view[1]===0x00&&view[2]===0x01&&view[3]===0x00) return 'image/x-icon';
  if (ascii(view,4,'ftyp')) {
    let brand='';
    for (let i=8;i<Math.min(view.length,48);i+=1) brand+=String.fromCharCode(view[i]);
    if (/avif|avis/.test(brand)) return 'image/avif';
    if (/heic|heix|hevc|hevx/.test(brand)) return 'image/heic';
    if (/mif1|msf1/.test(brand)) return 'image/heif';
  }
  return '';
}

export async function detectImageMimeFromFile(file) {
  if (!file?.slice) return '';
  try {
    const header = new Uint8Array(await file.slice(0, IMAGE_HEADER_BYTES).arrayBuffer());
    return detectImageMimeFromBytes(header);
  } catch { return ''; }
}

export function imageMimeFromFile(file) {
  const direct = String(file?.type || '').toLowerCase().split(';')[0];
  if (['image/jpeg','image/png','image/gif','image/webp','image/avif','image/heic','image/heif','image/bmp','image/tiff','image/x-icon'].includes(direct)) return direct;
  return '';
}

export function imageUploadErrorMessage(code) {
  const messages = {
    disconnected: 'اتصال چت قطع شده؛ دوباره وصل شو و تصویر را ارسال کن',
    timeout: 'ارسال تصویر بیش از حد طول کشید؛ اتصال اینترنت یا سرور را بررسی کن',
    'image-too-large': 'حداکثر حجم تصویر ۵ مگابایت است',
    'invalid-image-type': 'فرمت واقعی این فایل تصویر نیست یا پشتیبانی نمی‌شود',
    'image-type-mismatch': 'نوع واقعی فایل با فرمت اعلام‌شده تصویر یکسان نیست',
    'invalid-image': 'فایل تصویر قابل خواندن نیست',
    'not-in-room': 'عضویت اتاق از دست رفته؛ یک بار دوباره وارد اتاق شو',
    'rate-limit': 'چند ثانیه صبر کن و دوباره تصویر را بفرست',
    'storage-busy': 'فضای موقت ارسال تصویر پر شده؛ کمی بعد دوباره امتحان کن',
    'upload-busy': 'یک تصویر دیگر در حال ارسال است',
    'upload-expired': 'زمان ارسال تصویر تمام شد؛ دوباره ارسالش کن',
    'upload-not-found': 'ارسال تصویر منقضی شده؛ دوباره امتحان کن',
    'chunk-order': 'ارسال تصویر ناقص شد؛ دوباره امتحان کن',
    'chunk-too-large': 'بخش تصویر برای ارسال بزرگ بود؛ دوباره امتحان کن',
    'size-mismatch': 'حجم تصویر هنگام ارسال تغییر کرد؛ دوباره انتخابش کن',
    'upload-failed': 'ذخیره تصویر روی سرور انجام نشد',
    'server-busy': 'سرور در حال حاضر درگیر ارسال‌های دیگری است؛ کمی بعد امتحان کن',
    'private-key-missing': 'کلید خصوصی اتاق در این مرورگر موجود نیست',
  };
  return messages[code] || 'ارسال تصویر انجام نشد؛ دوباره امتحان کن';
}


async function uploadBlobInChunks(socket, { startEvent, chunkEvent, abortEvent, startPayload, blob, timeoutMs = MEDIA_UPLOAD_TIMEOUT_MS }) {
  const start = await emitWithAckTimeout(socket, startEvent, startPayload, timeoutMs);
  if (!start?.ok) {
    const error = new Error(start?.error || 'upload-failed');
    error.code = start?.error || 'upload-failed';
    throw error;
  }

  const chunkSize = Math.max(64 * 1024, Math.min(384 * 1024, Number(start.chunkSize) || 192 * 1024));
  const uploadId = String(start.uploadId || '');
  let index = 0;
  let finalResult = null;

  try {
    for (let offset = 0; offset < blob.size; offset += chunkSize, index += 1) {
      const end = Math.min(blob.size, offset + chunkSize);
      const data = await blob.slice(offset, end).arrayBuffer();
      const result = await emitWithAckTimeout(socket, chunkEvent, {
        uploadId,
        index,
        data,
        final: end >= blob.size,
      }, timeoutMs);
      if (!result?.ok) {
        const error = new Error(result?.error || 'upload-failed');
        error.code = result?.error || 'upload-failed';
        throw error;
      }
      finalResult = result;
    }
    if (!finalResult?.done) {
      const error = new Error('size-mismatch');
      error.code = 'size-mismatch';
      throw error;
    }
    return finalResult;
  } catch (error) {
    try { socket?.emit(abortEvent, { uploadId }); } catch {}
    throw error;
  }
}

export async function sendChunkedChatImage(socket, { file, imageType, caption = '', replyTo = null, privateMode = false, privateKey = '' }) {
  if (!file) throw Object.assign(new Error('invalid-image'), { code: 'invalid-image' });
  if (file.size > CHAT_IMAGE_MAX_BYTES) throw Object.assign(new Error('image-too-large'), { code: 'image-too-large' });

  const detectedMime = await detectImageMimeFromFile(file);
  if (!detectedMime) throw Object.assign(new Error('invalid-image-type'), { code: 'invalid-image-type' });
  if (imageType && detectedMime !== imageType && !(detectedMime === 'image/heif' && imageType === 'image/heic')) {
    throw Object.assign(new Error('image-type-mismatch'), { code: 'image-type-mismatch' });
  }

  let uploadBlob = file;
  let encryptedPayload = null;
  let mediaCipher = null;
  let uploadType = detectedMime;

  if (privateMode) {
    if (!privateKey) throw Object.assign(new Error('private-key-missing'), { code: 'private-key-missing' });
    const encryptedMeta = await encryptPrivateJson(privateKey, {
      text: String(caption || '').slice(0, 500),
      mentions: [],
      replyTo: replyTo || null,
      image: { name: String(file.name || 'image').slice(0, 120), mime: detectedMime },
    });
    const encryptedMedia = await encryptPrivateBytes(privateKey, await file.arrayBuffer());
    uploadBlob = new Blob([encryptedMedia.data], { type: 'application/octet-stream' });
    encryptedPayload = encryptedMeta;
    mediaCipher = encryptedMedia.descriptor;
    uploadType = 'application/octet-stream';
  }

  return uploadBlobInChunks(socket, {
    startEvent: 'chat:image:start',
    chunkEvent: 'chat:image:chunk',
    abortEvent: 'chat:image:abort',
    startPayload: {
      name: privateMode ? 'private-image.bin' : (file.name || 'image'),
      type: uploadType,
      size: uploadBlob.size,
      caption: privateMode ? '' : caption,
      replyToId: privateMode ? '' : (replyTo?.id || ''),
      encrypted: privateMode,
      encryptedPayload,
      mediaCipher,
    },
    blob: uploadBlob,
  });
}


export async function sendChunkedChatVoice(socket, { blob, durationMs, replyTo = null, privateMode = false, privateKey = '' }) {
  if (!blob?.size) throw Object.assign(new Error('invalid-audio'), { code: 'invalid-audio' });
  if (blob.size > CHAT_AUDIO_MAX_BYTES) throw Object.assign(new Error('audio-too-large'), { code: 'audio-too-large' });
  const safeDurationMs = Math.max(0, Math.min(CHAT_VOICE_MAX_MS, Number(durationMs) || 0));
  if (safeDurationMs < 250) throw Object.assign(new Error('audio-too-short'), { code: 'audio-too-short' });

  const originalMime = String(blob.type || 'audio/webm').toLowerCase().split(';')[0] || 'audio/webm';
  let uploadBlob = blob;
  let uploadType = originalMime;
  let encryptedPayload = null;
  let mediaCipher = null;

  if (privateMode) {
    if (!privateKey) throw Object.assign(new Error('private-key-missing'), { code: 'private-key-missing' });
    encryptedPayload = await encryptPrivateJson(privateKey, {
      text: '',
      mentions: [],
      replyTo: replyTo || null,
      audio: { mime: originalMime, durationMs: safeDurationMs },
    });
    const encryptedMedia = await encryptPrivateBytes(privateKey, await blob.arrayBuffer());
    uploadBlob = new Blob([encryptedMedia.data], { type: 'application/octet-stream' });
    uploadType = 'application/octet-stream';
    mediaCipher = encryptedMedia.descriptor;
  }

  return uploadBlobInChunks(socket, {
    startEvent: 'chat:voice:start',
    chunkEvent: 'chat:voice:chunk',
    abortEvent: 'chat:voice:abort',
    startPayload: {
      type: uploadType,
      size: uploadBlob.size,
      durationMs: privateMode ? 0 : safeDurationMs,
      replyToId: privateMode ? '' : (replyTo?.id || ''),
      encrypted: privateMode,
      encryptedPayload,
      mediaCipher,
    },
    blob: uploadBlob,
  });
}
