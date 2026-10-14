import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import axios from 'axios';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    // Now expecting comma-separated strings
    const { keyword, location } = body;

    const industries = keyword.split(',').map((k: string) => k.trim());
    const suburbs = location.split(',').map((l: string) => l.trim());

    let totalRawFound = 0;
    let totalSaved = 0;

    // Loop through every combination (e.g., Plumber in Norwood, then Plumber in Marion)
    for (const ind of industries) {
      for (const sub of suburbs) {
        
        // Just grab Page 1 for each specific micro-location to keep it fast
        const params: any = {
          engine: 'google_maps',
          q: `${ind} in ${sub}`,
          api_key: process.env.SERPAPI_KEY,
        };
        
        const response = await axios.get('https://serpapi.com/search.json', { params });
        const rawResults = response.data.local_results || [];
        totalRawFound += rawResults.length;

        // Apply the Goldmine Filter
        const goldmineLeads = rawResults.filter((place: any) => {
          const site = place.website?.toLowerCase() || "";
          return site === "" || site.includes("facebook.com");
        });

        // Upsert to Database
        for (const lead of goldmineLeads) {
          const saved = await prisma.lead.upsert({
            where: { placeId: lead.place_id },
            update: {}, 
            create: {
              name: lead.title,
              phone: lead.phone || "No phone",
              suburb: sub, // Tag it with the searched suburb
              reviewCount: lead.reviews || 0,
              website: lead.website || null,
              placeId: lead.place_id,
            }
          });
          // Only count it if it was actually newly created (createdAt is recent)
          const isNew = new Date().getTime() - new Date(saved.createdAt).getTime() < 5000;
          if (isNew) totalSaved++;
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      totalFound: totalRawFound,
      goldminesSaved: totalSaved 
    });

  } catch (error) {
    console.error("Scraping error:", error);
    return NextResponse.json({ error: "Failed to scrape leads" }, { status: 500 });
  }
}