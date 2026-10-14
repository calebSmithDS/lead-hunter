import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    // Outscraper sends the data in the body of the request
    const body = await request.json();
    
    // Outscraper results are nested in an array based on the queries we sent
    const allResults = body.data.flat(); 

    // Apply the Goldmine Filter (No website, or Facebook only)
    const goldmineLeads = allResults.filter((place: any) => {
      const site = place.site?.toLowerCase() || "";
      return site === "" || site.includes("facebook.com");
    });

    // Write the survivors to the database
    let savedCount = 0;
    for (const lead of goldmineLeads) {
      const saved = await prisma.lead.upsert({
        where: { placeId: lead.place_id },
        update: {}, 
        create: {
          name: lead.name,
          phone: lead.phone || "No phone",
          suburb: lead.city || "Unknown", 
          reviewCount: lead.reviews || 0,
          website: lead.site || null,
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