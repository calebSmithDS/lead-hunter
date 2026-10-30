import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import prisma from '@/lib/prisma';
import { auditLead } from '@/lib/audit';

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get('upstash-signature') ?? '';

  // Validate QStash signature when present
  if (process.env.NODE_ENV === 'production' || signature) {
    const isValid = await receiver.verify({
      signature,
      body: rawBody,
    }).catch(() => false);

    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const { leadId, website } = JSON.parse(rawBody);

    if (!leadId || !website) {
      return NextResponse.json({ error: 'Missing leadId or website' }, { status: 400 });
    }

    // Specification 4: Idempotency Protection
    // If auditStatus is already SUCCESS or PARTIAL_FAIL, exit immediately with HTTP 200
    const existingLead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: { auditStatus: true },
    });

    const isAlreadyAudited =
      existingLead &&
      ['SUCCESS', 'PARTIAL_FAIL', 'Audited', 'SKIPPED'].includes(existingLead.auditStatus);

    if (isAlreadyAudited) {
      console.log(`[Idempotency] Lead ${leadId} has status '${existingLead.auditStatus}'. Skipping.`);
      return NextResponse.json(
        { message: 'Lead already audited or skipped', status: existingLead.auditStatus, skipped: true },
        { status: 200 }
      );
    }

    const result = await auditLead(leadId, website);

    // Return 200 so QStash doesn't repeat retries on dead sites
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Audit worker failed' }, { status: 500 });
  }
}
