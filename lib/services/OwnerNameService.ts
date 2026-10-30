import axios from 'axios';

export interface OwnerNameResult {
  name: string | null;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  source: 'BUSINESS_NAME' | 'WEBSITE_SCRAPE' | null;
}

// Common business nouns to reject as person names
const NON_PERSON_NOUNS = new Set([
  'gardening', 'landscaping', 'services', 'solutions', 'repairs',
  'property', 'renovations', 'hot water', 'water', 'roofs', 'roofing',
  'mowing', 'studio', 'business', 'lawns', 'stepney', 'burnside',
  'morialta', 'darlington', 'exclusive', 'plus', 'state', 'trade',
  'after hours', 'trusted', 'apex', 'flowfix', 'flowtec', 'eastside',
  'festival', 'royal', 'flush', 'precise', 'little', 'jobs', 'group',
  'riverbank', 'urban', 'install', 'ezi'
]);

const TRADE_STOP_WORDS = [
  'pty ltd', 'pty. ltd.', 'pty', 'ltd',
  'plumbing & gas', 'plumbing and gas', 'plumbing & civil', 'plumbing and civil',
  'plumbing services', 'plumbing solutions', 'plumbing',
  'gasfitting', 'gas fitting', 'gas',
  'electrical', 'electrician', 'roofing', 'air conditioning', 'hvac',
  'solutions', 'services', 'maintenance', 'repairs', 'contractors',
  'group', 'sa', 'aust', 'australia', 'adelaide', 'co', 'and sons', '& sons', '& co'
];

export function isLikelyPersonName(candidate: string): boolean {
  if (!candidate) return false;
  const lower = candidate.toLowerCase();
  
  // Reject if contains any non-person business nouns
  for (const noun of NON_PERSON_NOUNS) {
    if (lower.includes(noun)) return false;
  }

  const parts = candidate.split(' ');
  // Single names (e.g. "Davo", "Adam", "Bradley")
  if (parts.length === 1) {
    return /^[A-Z][a-z]{2,15}$/.test(parts[0]);
  }
  // Full names (e.g. "Michael Gill", "Jason Morris")
  if (parts.length === 2) {
    return /^[A-Z][a-z]{1,15}$/.test(parts[0]) && /^[A-Z][a-z]{1,20}$/.test(parts[1]);
  }

  return false;
}

export function extractNameFromBusinessTitle(title: string): string | null {
  if (!title) return null;

  // Possessive name e.g. "Bradley's Gardening" -> "Bradley"
  const possessiveMatch = title.match(/^([A-Z][a-z]+)'s\s+/i);
  if (possessiveMatch && isLikelyPersonName(possessiveMatch[1])) {
    return possessiveMatch[1];
  }

  // Strip content in parentheses or after hyphens
  let clean = title.replace(/\(.*?\)/g, '').split('-')[0].trim();

  // Strip trade stop-words
  for (const word of TRADE_STOP_WORDS) {
    clean = clean.replace(new RegExp(`\\b${word}\\b`, 'gi'), ' ');
  }

  clean = clean.replace(/&/g, ' ').replace(/[,\.]/g, '').replace(/\s+/g, ' ').trim();
  const parts = clean.split(' ').filter(Boolean);

  if (parts.length === 2) {
    const candidate = `${parts[0]} ${parts[1]}`;
    if (isLikelyPersonName(candidate)) return candidate;
  }

  if (parts.length === 1) {
    if (isLikelyPersonName(parts[0])) return parts[0];
  }

  return null;
}

export async function scrapeWebsiteForOwner(websiteUrl: string): Promise<string | null> {
  try {
    const targetUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    const response = await axios.get(targetUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeadHunterBot/1.0',
      },
      responseType: 'text',
      maxContentLength: 1024 * 1024,
    });

    const html = typeof response.data === 'string' ? response.data : '';
    const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

    const triggerPatterns = [
      /(?:founded by|owned and operated by|owned by|established by)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:hi,?\s+i'm|hello,?\s+i'm|my name is)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:meet the owner|meet our founder),?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
      /(?:director|principal|master plumber)\s*:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    ];

    for (const pattern of triggerPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const candidate = match[1].trim();
        if (isLikelyPersonName(candidate)) {
          return candidate;
        }
      }
    }
  } catch {
    // Ignore timeout
  }

  return null;
}

export async function extractOwnerName(
  businessName: string,
  websiteUrl?: string | null
): Promise<OwnerNameResult> {
  const nameFromTitle = extractNameFromBusinessTitle(businessName);
  if (nameFromTitle) {
    return {
      name: nameFromTitle,
      confidence: nameFromTitle.includes(' ') ? 'HIGH' : 'MEDIUM',
      source: 'BUSINESS_NAME',
    };
  }

  if (websiteUrl && !websiteUrl.includes('facebook.com')) {
    const nameFromSite = await scrapeWebsiteForOwner(websiteUrl);
    if (nameFromSite) {
      return {
        name: nameFromSite,
        confidence: 'MEDIUM',
        source: 'WEBSITE_SCRAPE',
      };
    }
  }

  return {
    name: null,
    confidence: 'LOW',
    source: null,
  };
}
