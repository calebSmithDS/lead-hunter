import { NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
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
    const result = await auditLead(leadId, website);

    // Return 200 even if audit failed so QStash doesn't spam retries on dead websites
    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Audit queue failed' }, { status: 500 });
  }
}
