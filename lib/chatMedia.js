import { emitWithAckTimeout } from '@/lib/socketAck';

export const CHAT_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
export const CHAT_AUDIO_MAX_BYTES = 8 * 1024 * 1024;
export const CHAT_VOICE_MAX_MS = 5 * 60 * 1000;
const IMAGE_UPLOAD_TIMEOUT_MS = 15000;

export function imageMimeFromFile(file) {
  const direct = String(file?.type || '').toLowerCase();
  if (direct.startsWith('image/') && direct !== 'image/svg+xml') return direct;

  const ext = String(file?.name || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
  return ({
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.jfif': 'image/jpeg',
    '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
    '.avif': 'image/avif', '.heic': 'image/heic', '.heif': 'image/heif',
    '.bmp': 'image/bmp', '.tif': 'image/tiff', '.tiff': 'image/tiff', '.ico': 'image/x-icon',
  })[ext] || '';
}

export function imageUploadErrorMessage(code) {
  const messages = {
    disconnected: 'اتصال چت قطع شده؛ دوباره وصل شو و تصویر را ارسال کن',
    timeout: 'ارسال تصویر بیش از حد طول کشید؛ اتصال اینترنت یا سرور را بررسی کن',
    'image-too-large': 'حداکثر حجم تصویر ۳ مگابایت است',
    'invalid-image-type': 'فرمت این تصویر پشتیبانی نمی‌شود',
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
  };
  return messages[code] || 'ارسال تصویر انجام نشد؛ دوباره امتحان کن';
}

export async function sendChunkedChatImage(socket, { file, imageType, caption = '', replyToId = '' }) {
  if (!file) throw Object.assign(new Error('invalid-image'), { code: 'invalid-image' });
  if (file.size > CHAT_IMAGE_MAX_BYTES) throw Object.assign(new Error('image-too-large'), { code: 'image-too-large' });

  const start = await emitWithAckTimeout(socket, 'chat:image:start', {
    name: file.name || 'image',
    type: imageType,
    size: file.size,
    caption,
    replyToId,
  }, IMAGE_UPLOAD_TIMEOUT_MS);

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
    for (let offset = 0; offset < file.size; offset += chunkSize, index += 1) {
      const end = Math.min(file.size, offset + chunkSize);
      const data = await file.slice(offset, end).arrayBuffer();
      const result = await emitWithAckTimeout(socket, 'chat:image:chunk', {
        uploadId,
        index,
        data,
        final: end >= file.size,
      }, IMAGE_UPLOAD_TIMEOUT_MS);

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
    try { socket?.emit('chat:image:abort', { uploadId }); } catch {}
    throw error;
  }
}
