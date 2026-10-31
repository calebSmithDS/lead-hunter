import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditLead } from '@/lib/audit';

export const maxDuration = 60; // Allow Vercel functions up to 60s

export async function POST(request: Request) {
  try {
    const { statusFilter = 'PENDING' } = await request.json().catch(() => ({}));

    const whereCondition: any = {
      website: { not: null },
    };

    if (statusFilter === 'all_unaudited') {
      whereCondition.auditStatus = { in: ['PENDING', 'Pending', 'FAILED', 'Failed', 'PARTIAL_FAIL'] };
    } else if (statusFilter.toUpperCase() === 'FAILED') {
      whereCondition.auditStatus = { in: ['FAILED', 'Failed'] };
    } else if (statusFilter.toUpperCase() === 'PENDING') {
      whereCondition.auditStatus = { in: ['PENDING', 'Pending'] };
    } else {
      whereCondition.auditStatus = statusFilter;
    }

    const leads = await prisma.lead.findMany({
      where: whereCondition,
      take: 5, // Audit in fast batches of 5 to comfortably complete within Vercel's execution window
    });

    if (leads.length === 0) {
      return NextResponse.json({ message: 'No leads found to audit', processed: 0 });
    }

    const results = [];
    for (const lead of leads) {
      if (!lead.website) continue;
      const res = await auditLead(lead.id, lead.website);
      results.push({ id: lead.id, name: lead.name, ...res });
    }

    return NextResponse.json({
      message: `Audited ${results.length} leads`,
      processed: results.length,
      results,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Bulk audit failed' }, { status: 500 });
  }
}
