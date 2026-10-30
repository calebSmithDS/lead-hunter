import axios from 'axios';

export interface PageSpeedResult {
  success: boolean;
  performanceScore: number | null;
  seoScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  lcpMs: number | null;
  mobileScreenshot: string | null;
  error?: string;
}

/**
 * Runs Google PageSpeed Insights on a target website URL.
 * Requests mobile strategy and all 4 audit categories: performance, accessibility, best-practices, seo.
 */
export async function runPageSpeedAudit(websiteUrl: string): Promise<PageSpeedResult> {
  const cleanUrl = websiteUrl.trim();
  const urlToTest = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;

  const psiKey = process.env.GOOGLE_PSI_KEY;
  if (!psiKey) {
    return {
      success: false,
      performanceScore: null,
      seoScore: null,
      accessibilityScore: null,
      bestPracticesScore: null,
      lcpMs: null,
      mobileScreenshot: null,
      error: 'GOOGLE_PSI_KEY is not configured',
    };
  }

  // Construct URL with mobile strategy and the four requested categories
  const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
  const categoryParams = categories.map((cat) => `category=${cat}`).join('&');
  const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
    urlToTest
  )}&strategy=mobile&${categoryParams}&key=${psiKey}`;

  try {
    const response = await axios.get(psiUrl, { timeout: 60000 });
    const lighthouse = response.data.lighthouseResult;

    if (!lighthouse || !lighthouse.categories) {
      throw new Error('Malformed Lighthouse response structure');
    }

    // Category scores: convert decimal 0.0 - 1.0 to 0 - 100
    const parseScore = (catName: string): number | null => {
      const score = lighthouse.categories[catName]?.score;
      return typeof score === 'number' ? Math.round(score * 100) : null;
    };

    const performanceScore = parseScore('performance');
    const accessibilityScore = parseScore('accessibility');
    const bestPracticesScore = parseScore('best-practices');
    const seoScore = parseScore('seo');

    // Core Web Vitals: LCP in ms
    const lcpAudit = lighthouse.audits?.['largest-contentful-paint'];
    const lcpMs = typeof lcpAudit?.numericValue === 'number' ? Math.round(lcpAudit.numericValue) : null;

    // Mobile Screenshot: Base64 image data URI
    const screenshotData = lighthouse.audits?.['final-screenshot']?.details?.data || null;

    return {
      success: true,
      performanceScore,
      accessibilityScore,
      bestPracticesScore,
      seoScore,
      lcpMs,
      mobileScreenshot: typeof screenshotData === 'string' ? screenshotData : null,
    };
  } catch (error: any) {
    const errorMsg =
      error.response?.data?.error?.message ||
      error.message ||
      'PageSpeed API timeout or request failed';

    return {
      success: false,
      performanceScore: null,
      seoScore: null,
      accessibilityScore: null,
      bestPracticesScore: null,
      lcpMs: null,
      mobileScreenshot: null,
      error: errorMsg,
    };
  }
}

