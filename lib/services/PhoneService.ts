import axios from 'axios';

export type PhoneStatus = 'PENDING' | 'VERIFIED_MOBILE' | 'LANDLINE_ONLY' | 'UNAVAILABLE';
export type PhoneSource = 'OUTSCRAPER' | 'SCRAPE';

export interface PhoneEnrichmentResult {
  number: string | null;
  status: PhoneStatus;
  source: PhoneSource | null;
}

/**
 * Normalizes an Australian phone string by stripping spaces, hyphens, and parenthesis.
 */
export function normalizePhone(raw: string): string {
  return raw.replace(/[\s\-\(\)\.]/g, '');
}

/**
 * Classifies an Australian phone number based on ACMA prefixes.
 */
export function classifyAustralianNumber(phone: string): 'MOBILE' | 'LANDLINE' | 'INVALID' {
  const clean = normalizePhone(phone);

  // Australian Mobile: starts with 04 or +614 followed by 8 digits (total 10 digits for local 04, 11-12 for +614)
  if (/^(\+?61|0)4\d{8}$/.test(clean)) {
    return 'MOBILE';
  }

  // Australian Geographic Landlines (02, 03, 07, 08) or Inbound (1300, 1800)
  if (/^(\+?61|0)[2378]\d{8}$/.test(clean) || /^1(300|800)\d{6}$/.test(clean)) {
    return 'LANDLINE';
  }

  return 'INVALID';
}

/**
 * Scrapes a website's homepage HTML searching for mobile numbers matching AU format.
 */
export async function scrapeWebsiteForMobile(websiteUrl: string): Promise<string | null> {
  try {
    const targetUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    
    // Quick, lightweight fetch with a 5-second abort timeout
    const response = await axios.get(targetUrl, {
      timeout: 5000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeadHunterBot/1.0',
      },
      responseType: 'text',
      maxContentLength: 1024 * 1024, // Limit to 1MB to keep memory low
    });

    const html = typeof response.data === 'string' ? response.data : '';
    // Australian mobile regex pattern
    const mobileRegex = /(?:\+?61|0)4(?:[ -]?[0-9]){8}/g;
    const matches = html.match(mobileRegex);

    if (matches && matches.length > 0) {
      for (const candidate of matches) {
        const cleaned = normalizePhone(candidate);
        if (/^(\+?61|0)4\d{8}$/.test(cleaned)) {
          // Format standard display (e.g. 0412 345 678)
          return cleaned.startsWith('04') 
            ? `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7)}` 
            : cleaned;
        }
      }
    }
  } catch {
    // If the website is dead or blocks scrapers, gracefully return null
  }

  return null;
}

/**
 * Main Phone Enrichment service function following the specification.
 */
export async function enrichPhoneNumber(
  rawPhone: string | null | undefined,
  websiteUrl?: string | null
): Promise<PhoneEnrichmentResult> {
  // Step 1 & 2: Evaluate raw phone from Outscraper
  if (rawPhone && rawPhone.trim()) {
    const classification = classifyAustralianNumber(rawPhone);

    if (classification === 'MOBILE') {
      return {
        number: rawPhone.trim(),
        status: 'VERIFIED_MOBILE',
        source: 'OUTSCRAPER',
      };
    }

    if (classification === 'LANDLINE') {
      // Step 3: It is a landline. Check if we can find a mobile on their website as fallback
      if (websiteUrl && !websiteUrl.includes('facebook.com')) {
        const foundMobile = await scrapeWebsiteForMobile(websiteUrl);
        if (foundMobile) {
          return {
            number: foundMobile,
            status: 'VERIFIED_MOBILE',
            source: 'SCRAPE',
          };
        }
      }

      // If no mobile found, return the landline as LANDLINE_ONLY
      return {
        number: rawPhone.trim(),
        status: 'LANDLINE_ONLY',
        source: 'OUTSCRAPER',
      };
    }
  }

  // If phone was missing entirely, try the website fallback
  if (websiteUrl && !websiteUrl.includes('facebook.com')) {
    const foundMobile = await scrapeWebsiteForMobile(websiteUrl);
    if (foundMobile) {
      return {
        number: foundMobile,
        status: 'VERIFIED_MOBILE',
        source: 'SCRAPE',
      };
    }
  }

  // Fallback: No phone available or unclassifiable
  return {
    number: rawPhone?.trim() || null,
    status: rawPhone?.trim() ? 'LANDLINE_ONLY' : 'UNAVAILABLE',
    source: rawPhone?.trim() ? 'OUTSCRAPER' : null,
  };
}

