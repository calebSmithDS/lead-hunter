require('c:/lead_hunter/lead-hunter/node_modules/dotenv').config({ path: 'c:/lead_hunter/lead-hunter/.env' });
const { Pool } = require('c:/lead_hunter/lead-hunter/node_modules/pg');
const axios = require('c:/lead_hunter/lead-hunter/node_modules/axios');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const psiKey = process.env.GOOGLE_PSI_KEY;

// 1. Tech Stack Detection
async function detectTechStack(websiteUrl) {
  try {
    const targetUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
    const res = await axios.get(targetUrl, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LeadHunterBot/1.0' },
      maxContentLength: 2 * 1024 * 1024,
      validateStatus: (s) => s < 500
    });

    const headers = res.headers || {};
    const html = (typeof res.data === 'string' ? res.data : '').toLowerCase();
    const serverHeader = String(headers['server'] || '').toLowerCase();

    let cms = null;
    let builder = null;

    if (serverHeader.includes('squarespace') || html.includes('squarespace.com')) cms = 'Squarespace';
    else if (headers['x-wix-request-id'] || html.includes('wix.com')) cms = 'Wix';
    else if (html.includes('cdn.shopify.com')) cms = 'Shopify';
    else if (html.includes('wp-content') || html.includes('wordpress')) cms = 'WordPress';
    else if (html.includes('w-webflow')) cms = 'Webflow';
    else if (html.includes('godaddy') || html.includes('secureserver.net')) cms = 'GoDaddy';

    if (html.includes('elementor')) builder = 'Elementor';
    else if (html.includes('divi')) builder = 'Divi';

    if (cms && builder) return `${cms} (${builder})`;
    if (cms) return cms;
    if (builder) return builder;
    return 'Custom / Static';
  } catch (err) {
    return null;
  }
}

// 2. Google PageSpeed Audit
async function runPageSpeed(websiteUrl) {
  const targetUrl = websiteUrl.startsWith('http') ? websiteUrl : `https://${websiteUrl}`;
  const categories = ['performance', 'accessibility', 'best-practices', 'seo'];
  const categoryParams = categories.map(c => `category=${c}`).join('&');
  const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(targetUrl)}&strategy=mobile&${categoryParams}&key=${psiKey}`;

  try {
    const res = await axios.get(psiUrl, { timeout: 60000 });
    const lh = res.data.lighthouseResult;

    const perf = Math.round((lh.categories.performance?.score || 0) * 100);
    const a11y = Math.round((lh.categories.accessibility?.score || 0) * 100);
    const bp = Math.round((lh.categories['best-practices']?.score || 0) * 100);
    const seo = Math.round((lh.categories.seo?.score || 0) * 100);
    const lcpMs = Math.round(lh.audits['largest-contentful-paint']?.numericValue || 0);
    const screenshot = lh.audits['final-screenshot']?.details?.data || null;

    return { success: true, perf, a11y, bp, seo, lcpMs, screenshot };
  } catch (err) {
    return { success: false, error: err.response?.data?.error?.message || err.message };
  }
}

// Main Batch Runner
async function auditAllWebsites() {
  console.log('Fetching leads with custom websites needing new audit data...');

  // Select leads that have a real website (not facebook)
  // We prioritize leads where psiAccessibility is NULL (not yet enriched with the new metrics)
  const res = await pool.query(`
    SELECT id, name, website, "auditStatus", "psiAccessibility"
    FROM "Lead"
    WHERE website IS NOT NULL 
      AND website NOT LIKE '%facebook.com%'
      AND "psiAccessibility" IS NULL
    ORDER BY "createdAt" DESC
  `);

  const leads = res.rows;
  console.log(`Found ${leads.length} leads ready for full audit enrichment.\n`);

  let auditedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    console.log(`[${i + 1}/${leads.length}] Auditing: "${lead.name}" (${lead.website})`);

    // Run TechStack and PageSpeed in parallel
    const [techStack, psi] = await Promise.all([
      detectTechStack(lead.website),
      runPageSpeed(lead.website)
    ]);

    const auditStatus = psi.success ? (techStack ? 'SUCCESS' : 'PARTIAL_FAIL') : 'FAILED';

    if (psi.success) {
      await pool.query(`
        UPDATE "Lead"
        SET 
          "psiPerformanceScore" = $1,
          "psiAccessibility" = $2,
          "psiBestPractices" = $3,
          "psiSeoScore" = $4,
          "psiLcpMs" = $5,
          "mobileScreenshot" = $6,
          "techStackCms" = $7,
          "auditStatus" = $8,
          "updatedAt" = NOW()
        WHERE id = $9
      `, [
        psi.perf,
        psi.a11y,
        psi.bp,
        psi.seo,
        psi.lcpMs,
        psi.screenshot,
        techStack,
        auditStatus,
        lead.id
      ]);

      console.log(`  -> SUCCESS: Perf: ${psi.perf} | A11y: ${psi.a11y} | BestPrac: ${psi.bp} | SEO: ${psi.seo} | LCP: ${(psi.lcpMs/1000).toFixed(2)}s | CMS: ${techStack || 'None'}`);
      auditedCount++;
    } else {
      await pool.query(`
        UPDATE "Lead"
        SET 
          "techStackCms" = $1,
          "auditStatus" = 'FAILED',
          "auditErrorLog" = $2,
          "updatedAt" = NOW()
        WHERE id = $3
      `, [techStack, JSON.stringify({ pagespeed: psi.error }), lead.id]);

      console.log(`  -> FAILED: ${psi.error}`);
      failedCount++;
    }

    // Polite rate limit pause between Google Lighthouse API requests (2.5 seconds)
    if (i < leads.length - 1) {
      await new Promise(r => setTimeout(r, 2500));
    }
  }

  console.log(`\n===========================================`);
  console.log(`🎉 Batch Audit Complete!`);
  console.log(`  Audited: ${auditedCount}`);
  console.log(`  Failed:  ${failedCount}`);
  console.log(`===========================================\n`);

  await pool.end();
}

auditAllWebsites().catch(console.error);

