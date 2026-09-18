const { randomBytes } = require('crypto');

function createChunkedImageUploadStore({
  maxFileBytes,
  chunkBytes = 192 * 1024,
  ttlMs = 45 * 1000,
  maxReservedBytes = 32 * 1024 * 1024,
}) {
  const sessions = new Map();
  let reservedBytes = 0;

  function release(socketId) {
    const session = sessions.get(socketId);
    if (!session) return null;
    sessions.delete(socketId);
    reservedBytes = Math.max(0, reservedBytes - session.expectedBytes);
    return session;
  }

  function start(socketId, metadata) {
    const expectedBytes = Number(metadata?.size);
    if (!Number.isFinite(expectedBytes) || expectedBytes <= 0 || expectedBytes > maxFileBytes) {
      return { ok: false, error: 'image-too-large' };
    }
    if (sessions.has(socketId)) return { ok: false, error: 'upload-busy' };
    if (reservedBytes + expectedBytes > maxReservedBytes) return { ok: false, error: 'server-busy' };

    const session = {
      id: randomBytes(12).toString('hex'),
      socketId,
      expectedBytes,
      receivedBytes: 0,
      chunks: [],
      createdAt: Date.now(),
      metadata,
    };
    sessions.set(socketId, session);
    reservedBytes += expectedBytes;
    return { ok: true, uploadId: session.id, chunkSize: chunkBytes };
  }

  function append(socketId, { uploadId, index, data, final }) {
    const session = sessions.get(socketId);
    if (!session || session.id !== String(uploadId || '')) return { ok: false, error: 'upload-not-found' };
    if (Date.now() - session.createdAt > ttlMs) {
      release(socketId);
      return { ok: false, error: 'upload-expired' };
    }
    if (Number(index) !== session.chunks.length) { release(socketId); return { ok: false, error: 'chunk-order' }; }

    let buffer;
    try { buffer = Buffer.isBuffer(data) ? data : Buffer.from(data); } catch { return { ok: false, error: 'invalid-image' }; }
    if (!buffer.length || buffer.length > chunkBytes + 16 * 1024) { release(socketId); return { ok: false, error: 'chunk-too-large' }; }
    if (session.receivedBytes + buffer.length > session.expectedBytes) {
      release(socketId);
      return { ok: false, error: 'size-mismatch' };
    }

    session.chunks.push(buffer);
    session.receivedBytes += buffer.length;
    const complete = session.receivedBytes === session.expectedBytes;
    if (final && !complete) {
      release(socketId);
      return { ok: false, error: 'size-mismatch' };
    }
    if (!complete) return { ok: true, done: false, receivedBytes: session.receivedBytes };

    const completed = release(socketId);
    return {
      ok: true,
      done: true,
      metadata: completed.metadata,
      buffer: Buffer.concat(completed.chunks, completed.expectedBytes),
    };
  }

  function abort(socketId) {
    release(socketId);
  }

  function cleanupExpired(now = Date.now()) {
    for (const [socketId, session] of sessions) {
      if (now - session.createdAt > ttlMs) release(socketId);
    }
  }

  return { start, append, abort, cleanupExpired };
}

module.exports = { createChunkedImageUploadStore };
