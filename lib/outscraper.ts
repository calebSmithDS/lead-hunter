import prisma from '@/lib/prisma';
import axios from 'axios';
import { Client } from '@upstash/qstash';

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export async function processOutscraperResults(allResults: any[], outscraperJobId?: string) {
  // Deduplicate by Google place_id
  const uniqueLeads: any[] = Array.from(
    new Map(allResults.filter((l: any) => l.place_id).map((l: any) => [l.place_id, l])).values()
  );

  let goldminesCount = 0;
  let queuedCount = 0;
  let delaySeconds = 0;

  for (const lead of uniqueLeads) {
    if (!lead.place_id) continue;

    const url = (lead.site || lead.website || lead.url || '').toLowerCase();
    const isGoldmine = url === '' || url === 'null' || url.includes('facebook.com');

    let cleanSuburb = lead.city || lead.borough;
    if (!cleanSuburb && lead.query) {
      const parts = lead.query.split(' in ');
      cleanSuburb = parts[1] || 'Adelaide';
    }

    if (isGoldmine) {
      await prisma.lead.upsert({
        where: { placeId: lead.place_id },
        update: {},
        create: {
          name: lead.name || 'Unknown Business',
          phone: lead.phone || 'No phone',
          suburb: cleanSuburb,
          reviewCount: lead.reviews || 0,
          website: lead.site || lead.website || lead.url || null,
          placeId: lead.place_id,
          auditStatus: 'Skipped',
        },
      });
      goldminesCount++;
    } else {
      const savedLead = await prisma.lead.upsert({
        where: { placeId: lead.place_id },
        update: {},
        create: {
          name: lead.name || 'Unknown Business',
          phone: lead.phone || 'No phone',
          suburb: cleanSuburb,
          reviewCount: lead.reviews || 0,
          website: lead.site || lead.website || lead.url || null,
          placeId: lead.place_id,
          auditStatus: 'Pending',
        },
      });

      if (savedLead.auditStatus === 'Pending' && savedLead.website) {
        try {
          await qstash.publishJSON({
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/audit`,
            body: {
              leadId: savedLead.id,
              website: savedLead.website,
            },
            delay: delaySeconds,
            retries: 2, // Auto-retry up to 2 times for transient network errors
          });
          queuedCount++;
          delaySeconds += 15;
        } catch (e) {
          console.warn('QStash queue failed for lead:', savedLead.id, e);
        }
      }
    }
  }

  if (outscraperJobId) {
    await prisma.job.updateMany({
      where: { outscraperId: outscraperJobId },
      data: { status: 'Done' },
    });
  }

  return {
    totalProcessed: uniqueLeads.length,
    goldminesCount,
    queuedCount,
  };
}

/**
 * Polls Outscraper directly for a job's results and processes them.
 */
export async function syncOutscraperJob(jobId: string) {
  // Find internal job or outscraperId
  const job = await prisma.job.findFirst({
    where: {
      OR: [{ id: jobId }, { outscraperId: jobId }],
    },
  });

  const outscraperId = job ? job.outscraperId : jobId;

  const response = await axios.get(`https://api.outscraper.com/requests/${outscraperId}`, {
    headers: { 'X-API-KEY': process.env.OUTSCRAPER_KEY },
  });

  const status = response.data.status;
  const rawData = response.data.data || [];
  const allResults = rawData.flat();

  if (status === 'Success' && allResults.length > 0) {
    const summary = await processOutscraperResults(allResults, outscraperId);
    return { status: 'Success', ...summary };
  }

  return { status, totalFound: allResults.length };
}

