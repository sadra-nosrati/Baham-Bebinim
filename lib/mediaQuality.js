export function isHlsUrl(value) {
  return /\.m3u8($|\?)/i.test(String(value || ''));
}

export function qualityLabel(value) {
  const height = Number(value);
  return Number.isFinite(height) && height > 0 ? `${Math.round(height)}p` : 'نامشخص';
}

export function normalizedQualityOptions(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter(value => Number.isFinite(value) && value >= 144 && value <= 4320))]
    .sort((a, b) => a - b);
}

function chooseHlsLevel(levels, mode) {
  const candidates = levels
    .map((level, index) => ({ index, height: Number(level?.height) || 0, bitrate: Number(level?.bitrate) || 0 }))
    .filter(item => item.height > 0);

  if (!candidates.length) return null;
  const normalized = String(mode || 'auto').toLowerCase();

  if (normalized === 'high') {
    return candidates.reduce((best, item) => !best || item.height > best.height || (item.height === best.height && item.bitrate > best.bitrate) ? item : best, null);
  }
  if (normalized === 'low') {
    const minHeight = Math.min(...candidates.map(item => item.height));
    return candidates.filter(item => item.height === minHeight)
      .reduce((best, item) => !best || item.bitrate > best.bitrate ? item : best, null);
  }

  const requested = Number(normalized.replace(/p$/i, ''));
  if (!Number.isFinite(requested) || requested < 144) return null;

  const exact = candidates.filter(item => item.height === requested);
  if (exact.length) return exact.reduce((best, item) => !best || item.bitrate > best.bitrate ? item : best, null);

  return candidates.reduce((best, item) => {
    if (!best) return item;
    const distance = Math.abs(item.height - requested);
    const bestDistance = Math.abs(best.height - requested);
    if (distance !== bestDistance) return distance < bestDistance ? item : best;
    if (item.height !== best.height) return item.height < best.height ? item : best;
    return item.bitrate > best.bitrate ? item : best;
  }, null);
}

export function applyHlsQualityMode(hls, mode) {
  if (!hls) return null;
  const normalized = String(mode || 'auto').toLowerCase();

  if (normalized === 'auto') {
    hls.currentLevel = -1;
    hls.nextLevel = -1;
    hls.loadLevel = -1;
    return { mode: 'auto', height: 0, index: -1 };
  }

  const chosen = chooseHlsLevel(Array.isArray(hls.levels) ? hls.levels : [], normalized);
  if (!chosen) return null;

  // currentLevel performs an immediate manual switch in hls.js. Setting next/load
  // as well prevents the following fragment from jumping back to a previous level.
  hls.nextLevel = chosen.index;
  hls.loadLevel = chosen.index;
  hls.currentLevel = chosen.index;

  return { mode: normalized, ...chosen };
}
