import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditLead } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const { statusFilter = 'Pending' } = await request.json().catch(() => ({}));

    // Find leads matching the filter (e.g. 'Pending' or 'Failed' or both)
    const whereCondition: any = {
      website: { not: null },
    };

    if (statusFilter === 'all_unaudited') {
      whereCondition.auditStatus = { in: ['Pending', 'Failed'] };
    } else {
      whereCondition.auditStatus = statusFilter;
    }

    const leads = await prisma.lead.findMany({
      where: whereCondition,
      take: 25, // Safe batch limit per invocation
    });

    if (leads.length === 0) {
      return NextResponse.json({ message: 'No leads found to audit', processed: 0 });
    }

    // Process audits
    const results = [];
    for (const lead of leads) {
      if (!lead.website) continue;
      const res = await auditLead(lead.id, lead.website);
      results.push({ id: lead.id, name: lead.name, ...res });
      // Minor delay to respect Google's rate limits
      await new Promise((r) => setTimeout(r, 1200));
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

