import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Log a snippet of the raw payload to the Vercel console just in case we need to see it
    console.log("Raw Webhook Payload:", JSON.stringify(body).substring(0, 300));

    // Safely extract the array, whether Outscraper wraps it in .data or sends it directly
    const rawData = body.data ? body.data : (Array.isArray(body) ? body : []);
    const allResults = rawData.flat(); 

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