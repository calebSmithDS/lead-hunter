import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Safely extract the array of businesses
    const rawData = body.data ? body.data : (Array.isArray(body) ? body : []);
    const allResults = rawData.flat(); 

    // The Bulletproof Goldmine Filter
    const goldmineLeads = allResults.filter((place: any) => {
      // Check both 'site' and 'website' just in case Outscraper changes keys
      const url = (place.site || place.website || "").toLowerCase();
      
      // Keep it if it has no website, says "null", or is a Facebook page
      return url === "" || url === "null" || url.includes("facebook.com");
    });

    // Write the survivors to the database
    let savedCount = 0;
    for (const lead of goldmineLeads) {
      
      // Safety check: Google occasionally returns leads without place_ids. Skip them.
      if (!lead.place_id) continue;

      await prisma.lead.upsert({
        where: { placeId: lead.place_id },
        update: {}, 
        create: {
          name: lead.name || "Unknown Business",
          phone: lead.phone || "No phone",
          suburb: lead.city || lead.borough || "Unknown", 
          reviewCount: lead.reviews || 0,
          // Save whichever web key Outscraper provided
          website: lead.site || lead.website || null,
          placeId: lead.place_id,
        }
      });
      savedCount++;
    }

    console.log(`Webhook processed. ${savedCount} goldmine leads saved to database.`);
    return NextResponse.json({ received: true });

  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
  }
}