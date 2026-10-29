import { NextResponse } from 'next/server';
import axios from 'axios';
import { processOutscraperResults } from '@/lib/outscraper';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('Outscraper webhook received payload for job:', body.id);

    const resultsUrl = body.results_location;
    let allResults = [];

    if (resultsUrl) {
      const response = await axios.get(resultsUrl, {
        headers: { 'X-API-KEY': process.env.OUTSCRAPER_KEY },
      });
      const rawData = response.data.data || response.data || [];
      allResults = rawData.flat();
    } else {
      const rawData = body.data ? body.data : Array.isArray(body) ? body : [];
      allResults = rawData.flat();
    }

    const summary = await processOutscraperResults(allResults, body.id);
    console.log('Processed webhook successfully:', summary);

    return NextResponse.json({ received: true, ...summary });
  } catch (error: any) {
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: error.message || 'Webhook failed' }, { status: 500 });
  }
}
