/**
 * Normalizes industry search terms to prevent duplicate scraping campaigns
 * e.g. "plumber" === "Plumber" === "Plumbing" === "plumbing services"
 */
export function normalizeKeyword(rawKeyword: string): string {
  if (!rawKeyword) return '';

  let clean = rawKeyword
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Root mapping table for Australian trade keywords
  if (clean.includes('plumb') || clean.includes('gas fit') || clean.includes('drain')) {
    return 'plumbing';
  }
  if (clean.includes('electr') || clean.includes('sparky') || clean.includes('solar')) {
    return 'electrical';
  }
  if (clean.includes('roof')) {
    return 'roofing';
  }
  if (clean.includes('paint')) {
    return 'painting';
  }
  if (clean.includes('build') || clean.includes('renovat') || clean.includes('carpent')) {
    return 'building';
  }
  if (clean.includes('air con') || clean.includes('hvac') || clean.includes('refrigerat')) {
    return 'air_conditioning';
  }
  if (clean.includes('landscap') || clean.includes('garden') || clean.includes('mow') || clean.includes('lawn')) {
    return 'landscaping';
  }
  if (clean.includes('pest')) {
    return 'pest_control';
  }
  if (clean.includes('clean')) {
    return 'cleaning';
  }

  // Fallback: strip common plurals / suffixes
  return clean.replace(/s$/, '').replace(/ing$/, '');
}

