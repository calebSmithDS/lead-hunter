import axios from 'axios';

export interface TechStackResult {
  success: boolean;
  cms: string | null;
  pageBuilder: string | null;
  summary: string | null;
  error?: string;
}

/**
 * Analyzes HTTP headers, meta generator tags, and script sources
 * to detect the CMS and Page Builder powering a website.
 */
export async function detectTechStack(websiteUrl: string): Promise<TechStackResult> {
  const cleanUrl = websiteUrl.trim();
  const urlToTest = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;

  try {
    const response = await axios.get(urlToTest, {
      timeout: 8000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      maxContentLength: 2 * 1024 * 1024, // 2MB
      validateStatus: (status) => status < 500, // Process 2xx, 3xx, 4xx
    });

    const headers = response.headers || {};
    const html = typeof response.data === 'string' ? response.data : '';
    const lowerHtml = html.toLowerCase();

    let detectedCms: string | null = null;
    let detectedBuilder: string | null = null;

    // 1. Check HTTP Headers
    const poweredBy = String(headers['x-powered-by'] || '').toLowerCase();
    const serverHeader = String(headers['server'] || '').toLowerCase();

    if (poweredBy.includes('wp-engine') || headers['x-pingback']?.toString().includes('xmlrpc.php')) {
      detectedCms = 'WordPress';
    } else if (headers['x-wix-request-id']) {
      detectedCms = 'Wix';
    } else if (serverHeader.includes('squarespace')) {
      detectedCms = 'Squarespace';
    } else if (serverHeader.includes('cloudflare') && lowerHtml.includes('cdn.shopify.com')) {
      detectedCms = 'Shopify';
    }

    // 2. Check HTML Meta Generator Tags & Markers
    if (!detectedCms) {
      if (lowerHtml.includes('content="wordpress') || lowerHtml.includes('/wp-content/') || lowerHtml.includes('/wp-includes/')) {
        detectedCms = 'WordPress';
      } else if (lowerHtml.includes('wix.com') || lowerHtml.includes('static.wixstatic.com')) {
        detectedCms = 'Wix';
      } else if (lowerHtml.includes('squarespace.com') || lowerHtml.includes('static1.squarespace.com')) {
        detectedCms = 'Squarespace';
      } else if (lowerHtml.includes('shopify.com') || lowerHtml.includes('cdn.shopify.com')) {
        detectedCms = 'Shopify';
      } else if (lowerHtml.includes('w-webflow') || lowerHtml.includes('uploads-ssl.webflow.com')) {
        detectedCms = 'Webflow';
      } else if (lowerHtml.includes('weebly.com') || lowerHtml.includes('editmysite.com')) {
        detectedCms = 'Weebly';
      } else if (lowerHtml.includes('godaddy') || lowerHtml.includes('secureserver.net')) {
        detectedCms = 'GoDaddy Website Builder';
      } else if (lowerHtml.includes('joomla')) {
        detectedCms = 'Joomla';
      } else if (lowerHtml.includes('drupal')) {
        detectedCms = 'Drupal';
      }
    }

    // 3. Check Page Builders (especially for WordPress sites)
    if (lowerHtml.includes('elementor') || lowerHtml.includes('/plugins/elementor/')) {
      detectedBuilder = 'Elementor';
    } else if (lowerHtml.includes('divi') || lowerHtml.includes('/themes/divi/')) {
      detectedBuilder = 'Divi';
    } else if (lowerHtml.includes('beaver-builder') || lowerHtml.includes('fl-builder')) {
      detectedBuilder = 'Beaver Builder';
    } else if (lowerHtml.includes('wpbakery') || lowerHtml.includes('js_composer')) {
      detectedBuilder = 'WPBakery';
    } else if (lowerHtml.includes('bricks') || lowerHtml.includes('/themes/bricks/')) {
      detectedBuilder = 'Bricks Builder';
    }

    // Compose human-readable summary
    let summary: string | null = null;
    if (detectedCms && detectedBuilder) {
      summary = `${detectedCms} (${detectedBuilder})`;
    } else if (detectedCms) {
      summary = detectedCms;
    } else if (detectedBuilder) {
      summary = detectedBuilder;
    } else {
      summary = 'Custom / Static';
    }

    return {
      success: true,
      cms: detectedCms,
      pageBuilder: detectedBuilder,
      summary,
    };
  } catch (error: any) {
    return {
      success: false,
      cms: null,
      pageBuilder: null,
      summary: null,
      error: error.message || 'Failed to detect tech stack',
    };
  }
}

