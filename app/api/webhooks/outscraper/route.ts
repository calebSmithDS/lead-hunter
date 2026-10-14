import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import axios from 'axios';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Check if Outscraper sent a results URL
    const resultsUrl = body.results_location;
    let allResults = [];

    if (resultsUrl) {
      // Fetch the actual dataset from Outscraper using your API key
      const response = await axios.get(resultsUrl, {
        headers: { 'X-API-KEY': process.env.OUTSCRAPER_KEY }
      });
      
      const rawData = response.data.data || response.data || [];
      allResults = rawData.flat();
    } else {
      // Fallback in case it ever sends raw data directly
      const rawData = body.data ? body.data : (Array.isArray(body) ? body : []);
      allResults = rawData.flat();
    }

    let savedCount = 0;

    for (const lead of allResults) {
      if (!lead.place_id) continue;

      const url = (lead.site || lead.website || lead.url || "").toLowerCase();
      const isGoldmine = url === "" || url === "null" || url.includes("facebook.com");

      if (isGoldmine) {
        let cleanSuburb = lead.city || lead.borough;
        if (!cleanSuburb && lead.query) {
          const parts = lead.query.split(" in ");
          cleanSuburb = parts[1] || "Adelaide";
        }

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
          }
        });
        savedCount++;
      }
    }

    console.log(`Webhook successfully fetched and processed. ${savedCount} goldmine leads saved to database.`);
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