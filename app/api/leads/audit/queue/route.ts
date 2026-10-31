import { NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';
import prisma from '@/lib/prisma';

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export async function POST(request: Request) {
  try {
    const { statusFilter = 'PENDING' } = await request.json().catch(() => ({}));

    const whereCondition: any = {
      website: { not: null },
    };

    if (statusFilter.toUpperCase() === 'FAILED') {
      whereCondition.auditStatus = { in: ['FAILED', 'Failed'] };
    } else {
      whereCondition.auditStatus = { in: ['PENDING', 'Pending'] };
    }

    // Fetch leads needing audit
    const leads = await prisma.lead.findMany({
      where: whereCondition,
      select: { id: true, website: true },
      take: 100, // Queue up to 100 at a time
    });

    if (leads.length === 0) {
      return NextResponse.json({ message: 'No leads found to queue', queuedCount: 0 });
    }

    // Determine target URL: use production app URL or fallback
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (
      process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : ''
    );

    if (!baseUrl) {
      return NextResponse.json({ error: 'NEXT_PUBLIC_APP_URL is not configured.' }, { status: 500 });
    }

    const auditEndpoint = `${baseUrl.replace(/\/$/, '')}/api/jobs/audit`;

    let queuedCount = 0;
    let delaySeconds = 0;

    for (const lead of leads) {
      if (!lead.website) continue;

      try {
        await qstash.publishJSON({
          url: auditEndpoint,
          body: {
            leadId: lead.id,
            website: lead.website,
          },
          delay: delaySeconds,
          retries: 2,
        });
        queuedCount++;
        delaySeconds += 5; // Stagger by 5 seconds to stay safe from rate limits
      } catch (e: any) {
        console.warn(`Failed to queue lead ${lead.id} to QStash:`, e.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Dispatched ${queuedCount} audits to background queue (running every 5s).`,
      queuedCount,
    });
  } catch (error: any) {
    console.error('Queue bulk audit error:', error);
    return NextResponse.json({ error: error.message || 'Failed to dispatch audits' }, { status: 500 });
  }
}

