import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { keyword, location } = await request.json();

    const industries = keyword.split(',').map((k: string) => k.trim());
    const suburbs = location.split(',').map((l: string) => l.trim());

    // Build the matrix of queries (e.g., ["plumber in Norwood, SA", "roofer in Norwood, SA"])
    const queries = [];
    for (const sub of suburbs) {
      for (const ind of industries) {
        queries.push(`${ind} in ${sub}`);
      }
    }

    // This is the public URL of your app where Outscraper will send the results
    const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL + '/api/webhooks/outscraper';

   // Send the massive job to Outscraper
    const response = await fetch('https://api.outscraper.com/google-maps-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': process.env.OUTSCRAPER_KEY as string,
      },
      body: JSON.stringify({
        query: queries,
        limit: 250,
        async: true,
        webhook: WEBHOOK_URL,
      }),
    });

    const data = await response.json();

    // NEW: Actually check if Outscraper accepted the job
    if (!response.ok) {
      console.error("❌ OUTSCRAPER REJECTED THE REQUEST:", data);
      return NextResponse.json({ error: data }, { status: response.status });
    }

    console.log("✅ OUTSCRAPER ACCEPTED THE JOB. ID:", data.id);

    return NextResponse.json({ 
      success: true, 
      message: "Bulk hunt initiated", 
      jobId: data.id 
    });

  } catch (error) {
    console.error("Trigger error:", error);
    return NextResponse.json({ error: "Failed to start bulk job" }, { status: 500 });
  }
}