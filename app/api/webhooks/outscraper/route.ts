import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import axios from 'axios';
import { Client } from '@upstash/qstash';

// Initialize the QStash client
const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const resultsUrl = body.results_location;
    let allResults = [];

    if (resultsUrl) {
      const response = await axios.get(resultsUrl, {
        headers: { 'X-API-KEY': process.env.OUTSCRAPER_KEY }
      });
      const rawData = response.data.data || response.data || [];
      allResults = rawData.flat();
    } else {
      const rawData = body.data ? body.data : (Array.isArray(body) ? body : []);
      allResults = rawData.flat();
    }

    const uniqueLeads: any[] = Array.from(
      new Map(allResults.filter((l: any) => l.place_id).map((l: any) => [l.place_id, l])).values()
    );

    let goldminesCount = 0;
    let queuedCount = 0;
    let delaySeconds = 0;

    for (const lead of uniqueLeads) {
      if (!lead.place_id) continue;

      const url = (lead.site || lead.website || lead.url || "").toLowerCase();
      const isGoldmine = url === "" || url === "null" || url.includes("facebook.com");

      let cleanSuburb = lead.city || lead.borough;
      if (!cleanSuburb && lead.query) {
        const parts = lead.query.split(" in ");
        cleanSuburb = parts[1] || "Adelaide";
      }

      if (isGoldmine) {
        // BUCKET A: No custom website. Save and skip audit.
        await prisma.lead.upsert({
          where: { placeId: lead.place_id },
          update: {}, 
          create: {
            name: lead.name || "Unknown Business",
            phone: lead.phone || "No phone",
            suburb: cleanSuburb, 
            reviewCount: lead.reviews || 0,
            website: lead.site || lead.website || lead.url || null,
            placeId: lead.place_id,
            auditStatus: "Skipped" 
          }
        });
        goldminesCount++;
      } else {
        // BUCKET B: Custom website exists. Save as Pending and queue for audit.
        const savedLead = await prisma.lead.upsert({
          where: { placeId: lead.place_id },
          update: {}, 
          create: {
            name: lead.name || "Unknown Business",
            phone: lead.phone || "No phone",
            suburb: cleanSuburb, 
            reviewCount: lead.reviews || 0,
            website: lead.site || lead.website || lead.url || null,
            placeId: lead.place_id,
            auditStatus: "Pending" 
          }
        });

        // Only queue it if it actually needs an audit
        if (savedLead.auditStatus === "Pending" && savedLead.website) {
          await qstash.publishJSON({
            url: `${process.env.NEXT_PUBLIC_APP_URL}/api/jobs/audit`,
            body: { 
              leadId: savedLead.id, 
              website: savedLead.website 
            },
            delay: delaySeconds
          });
          queuedCount++;
          delaySeconds += 15;
        }
      }
    }

    console.log(`Webhook processed. ${goldminesCount} goldmines saved. ${queuedCount} sites queued for auditing.`);
    return NextResponse.json({ received: true });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}
// testing route
// import { NextResponse } from 'next/server';

// export async function POST(request: Request) {
//   try {
//     const body = await request.json();
    
//     console.log("🕵️ SPY WEBHOOK RECEIVED PAYLOAD:", JSON.stringify(body, null, 2));

//     return NextResponse.json({ received: true, debug: "Spy log active" });

//   } catch (error) {
//     console.error("🕵️ SPY WEBHOOK CRASHED:", error);
//     return NextResponse.json({ error: "Spy webhook failed" }, { status: 500 });
//   }
// }