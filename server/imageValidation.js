const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
  'image/x-icon': '.ico',
};

function isAscii(buffer, offset, value) {
  if (!Buffer.isBuffer(buffer) || offset < 0 || offset + value.length > buffer.length) return false;
  return buffer.subarray(offset, offset + value.length).toString('ascii') === value;
}

function detectIsoBmffImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 16 || !isAscii(buffer, 4, 'ftyp')) return '';
  const scan = buffer.subarray(8, Math.min(buffer.length, 48)).toString('ascii');
  if (/avif|avis/.test(scan)) return 'image/avif';
  if (/heic|heix|hevc|hevx|mif1|msf1/.test(scan)) return /heic|heix|hevc|hevx/.test(scan) ? 'image/heic' : 'image/heif';
  return '';
}

function detectImageMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return '';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return 'image/png';
  if (isAscii(buffer, 0, 'GIF87a') || isAscii(buffer, 0, 'GIF89a')) return 'image/gif';
  if (isAscii(buffer, 0, 'RIFF') && isAscii(buffer, 8, 'WEBP')) return 'image/webp';
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return 'image/bmp';
  if ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) ||
      (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)) return 'image/tiff';
  if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) return 'image/x-icon';
  return detectIsoBmffImage(buffer);
}

function extensionForImageMime(mime) {
  return MIME_TO_EXT[String(mime || '').toLowerCase()] || '';
}

function isSupportedImageMime(mime) {
  return Boolean(extensionForImageMime(mime));
}

module.exports = { detectImageMime, extensionForImageMime, isSupportedImageMime };
