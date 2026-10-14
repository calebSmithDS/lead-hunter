// import { NextResponse } from 'next/server';
// import prisma from '@/lib/prisma';

// export async function POST(request: Request) {
//   try {
//     const body = await request.json();
    
//     const rawData = body.data ? body.data : (Array.isArray(body) ? body : []);
//     const allResults = rawData.flat(); 

//     let savedCount = 0;

//     for (const lead of allResults) {
//       if (!lead.place_id) continue;

//       const url = (lead.site || lead.website || lead.url || "").toLowerCase();
//       const isGoldmine = url === "" || url === "null" || url.includes("facebook.com");

//       if (isGoldmine) {
//         // Extract a clean suburb name even if Outscraper returns null for city
//         let cleanSuburb = lead.city || lead.borough;
//         if (!cleanSuburb && lead.query) {
//           // Pull the location out of the query string (e.g., "Landscaper in Adelaide SA" -> "Adelaide SA")
//           const parts = lead.query.split(" in ");
//           cleanSuburb = parts[1] || "Adelaide";
//         }

//         await prisma.lead.upsert({
//           where: { placeId: lead.place_id },
//           update: {}, 
//           create: {
//             name: lead.name || "Unknown Business",
//             phone: lead.phone || "No phone",
//             suburb: cleanSuburb, 
//             reviewCount: lead.reviews || 0,
//             website: lead.website || lead.site || lead.url || null,
//             placeId: lead.place_id,
//           }
//         });
//         savedCount++;
//       }
//     }

//     console.log(`Webhook processed. ${savedCount} goldmine leads saved to database.`);
//     return NextResponse.json({ received: true });

//   } catch (error) {
//     console.error("Webhook processing error:", error);
//     return NextResponse.json({ error: "Webhook failed" }, { status: 500 });
//   }
// }

// testing route
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    console.log("🕵️ SPY WEBHOOK RECEIVED PAYLOAD:", JSON.stringify(body, null, 2));

    return NextResponse.json({ received: true, debug: "Spy log active" });

  } catch (error) {
    console.error("🕵️ SPY WEBHOOK CRASHED:", error);
    return NextResponse.json({ error: "Spy webhook failed" }, { status: 500 });
  }
}