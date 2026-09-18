const LEGACY_QUALITY_MODES = new Set(['low', 'high']);

function normalizeQualityMode(value) {
  const mode = String(value || 'auto').toLowerCase().trim();
  if (mode === 'auto' || LEGACY_QUALITY_MODES.has(mode)) return mode;
  const match = mode.match(/^(\d{3,4})p?$/);
  if (!match) return 'auto';
  const height = Number(match[1]);
  return Number.isFinite(height) && height >= 144 && height <= 4320 ? String(height) : 'auto';
}

function qualityModeHeight(mode) {
  const normalized = normalizeQualityMode(mode);
  const height = Number(normalized);
  return Number.isFinite(height) && height >= 144 && height <= 4320 ? height : 0;
}

function qualityNumber(item) {
  const raw = String(item?.profile || item?.label || item?.quality || item?.height || '');
  const match = raw.match(/(\d{3,4})/);
  const quality = match ? Number(match[1]) : 0;
  return Number.isFinite(quality) && quality >= 144 && quality <= 4320 ? quality : 0;
}

function normalizeQualityOptions(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(Number)
    .filter(value => Number.isFinite(value) && value >= 144 && value <= 4320))]
    .sort((a, b) => a - b);
}

function selectQualitySource(sources, mode = 'auto') {
  const candidates = Array.isArray(sources) ? sources.filter(item => item?.url) : [];
  if (!candidates.length) return null;
  const withQuality = candidates.filter(item => Number(item.quality) > 0);
  if (!withQuality.length) return candidates[0];

  mode = normalizeQualityMode(mode);
  if (mode === 'low') return withQuality.reduce((best, item) => item.quality < best.quality ? item : best);
  if (mode === 'high') return withQuality.reduce((best, item) => item.quality > best.quality ? item : best);

  const requestedHeight = qualityModeHeight(mode);
  if (requestedHeight) {
    const exact = withQuality.find(item => Number(item.quality) === requestedHeight);
    if (exact) return exact;
    return withQuality.reduce((best, item) => {
      const distance = Math.abs(Number(item.quality) - requestedHeight);
      const bestDistance = Math.abs(Number(best.quality) - requestedHeight);
      if (distance !== bestDistance) return distance < bestDistance ? item : best;
      return Number(item.quality) < Number(best.quality) ? item : best;
    });
  }

  return withQuality.reduce((best, item) => {
    const score = Math.abs(item.quality - 720) + (item.quality > 1080 ? 500 : 0);
    const bestScore = Math.abs(best.quality - 720) + (best.quality > 1080 ? 500 : 0);
    return score < bestScore ? item : best;
  });
}

module.exports = {
  normalizeQualityMode,
  qualityModeHeight,
  qualityNumber,
  normalizeQualityOptions,
  selectQualitySource,
};
