import prisma from '@/lib/prisma';
import axios from 'axios';

export interface AuditResult {
  success: boolean;
  performanceScore?: number;
  seoScore?: number;
  mobileLoadTime?: number;
  error?: string;
}

/**
 * Audits a single website URL using Google PageSpeed Insights (Mobile)
 * and updates the lead record in the database.
 */
export async function auditLead(leadId: string, website: string): Promise<AuditResult> {
  if (!leadId || !website) {
    return { success: false, error: 'Missing leadId or website' };
  }

  // Ensure URL has a protocol for Google's API
  const cleanUrl = website.trim();
  const urlToTest = cleanUrl.startsWith('http') ? cleanUrl : `https://${cleanUrl}`;

  const psiKey = process.env.GOOGLE_PSI_KEY;
  const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
    urlToTest
  )}&strategy=mobile&category=performance&category=seo&key=${psiKey}`;

  try {
    const response = await axios.get(psiUrl, { timeout: 45000 });
    const lighthouse = response.data.lighthouseResult;

    const performanceScore = Math.round((lighthouse.categories.performance?.score || 0) * 100);
    const seoScore = Math.round((lighthouse.categories.seo?.score || 0) * 100);
    const lcpMs = lighthouse.audits['largest-contentful-paint']?.numericValue || 0;
    const mobileLoadTime = parseFloat((lcpMs / 1000).toFixed(2));

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        performanceScore,
        seoScore,
        mobileLoadTime,
        auditStatus: 'Audited',
      },
    });

    return { success: true, performanceScore, seoScore, mobileLoadTime };
  } catch (error: any) {
    const errMsg = error.response?.data?.error?.message || error.message || 'Audit failed';
    console.warn(`Audit failed for ${leadId} (${urlToTest}):`, errMsg);

    await prisma.lead.update({
      where: { id: leadId },
      data: { auditStatus: 'Failed' },
    });

    return { success: false, error: errMsg };
  }
}

