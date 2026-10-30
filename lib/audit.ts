import prisma from '@/lib/prisma';
import { runPageSpeedAudit, PageSpeedResult } from '@/lib/services/PageSpeedService';
import { detectTechStack, TechStackResult } from '@/lib/services/TechStackService';

export interface ComprehensiveAuditResult {
  success: boolean;
  auditStatus: 'SUCCESS' | 'PARTIAL_FAIL' | 'FAILED';
  pageSpeed: PageSpeedResult | null;
  techStack: TechStackResult | null;
  errorLog?: Record<string, string>;
}

/**
 * Executes concurrent PageSpeed and TechStack audits for a lead using Promise.allSettled().
 * Supports Graceful Degradation & Error Logging per Specification 4.
 */
export async function auditLead(leadId: string, website: string): Promise<ComprehensiveAuditResult> {
  if (!leadId || !website) {
    return {
      success: false,
      auditStatus: 'FAILED',
      pageSpeed: null,
      techStack: null,
      errorLog: { general: 'Missing leadId or website' },
    };
  }

  // Execute both intensive third-party audits concurrently
  const [psiResultSettled, techResultSettled] = await Promise.allSettled([
    runPageSpeedAudit(website),
    detectTechStack(website),
  ]);

  const psiData: PageSpeedResult | null =
    psiResultSettled.status === 'fulfilled' ? psiResultSettled.value : null;
  const techData: TechStackResult | null =
    techResultSettled.status === 'fulfilled' ? techResultSettled.value : null;

  const errorLog: Record<string, string> = {};

  if (!psiData || !psiData.success) {
    errorLog.pagespeed =
      psiData?.error || (psiResultSettled.status === 'rejected' ? String(psiResultSettled.reason) : 'Unknown failure');
  }

  if (!techData || !techData.success) {
    errorLog.wappalyzer =
      techData?.error || (techResultSettled.status === 'rejected' ? String(techResultSettled.reason) : 'Unknown failure');
  }

  // Determine Pipeline Status
  const psiOk = !!(psiData && psiData.success);
  const techOk = !!(techData && techData.success);

  let auditStatus: 'SUCCESS' | 'PARTIAL_FAIL' | 'FAILED' = 'FAILED';
  if (psiOk && techOk) {
    auditStatus = 'SUCCESS';
  } else if (psiOk || techOk) {
    auditStatus = 'PARTIAL_FAIL';
  } else {
    auditStatus = 'FAILED';
  }

  // Update Database with extracted audit & tech stack metrics
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      // PageSpeed metrics
      psiPerformanceScore: psiData?.performanceScore ?? null,
      psiSeoScore: psiData?.seoScore ?? null,
      psiAccessibility: psiData?.accessibilityScore ?? null,
      psiBestPractices: psiData?.bestPracticesScore ?? null,
      psiLcpMs: psiData?.lcpMs ?? null,
      mobileScreenshot: psiData?.mobileScreenshot ?? null,

      // Tech Stack
      techStackCms: techData?.summary ?? techData?.cms ?? null,

      // Observability
      auditStatus,
      auditErrorLog: Object.keys(errorLog).length > 0 ? errorLog : undefined,
    },
  });

  return {
    success: auditStatus !== 'FAILED',
    auditStatus,
    pageSpeed: psiData,
    techStack: techData,
    errorLog: Object.keys(errorLog).length > 0 ? errorLog : undefined,
  };
}
