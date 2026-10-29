import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { auditLead } from '@/lib/audit';

export async function POST(request: Request) {
  try {
    const { leadId } = await request.json();

    if (!leadId) {
      return NextResponse.json({ error: 'Missing leadId' }, { status: 400 });
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    }

    if (!lead.website) {
      return NextResponse.json({ error: 'Lead does not have a website to audit' }, { status: 400 });
    }

    // Mark as Pending while working
    await prisma.lead.update({
      where: { id: leadId },
      data: { auditStatus: 'Pending' },
    });

    const result = await auditLead(lead.id, lead.website);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Audit failed' }, { status: 500 });
  }
}

