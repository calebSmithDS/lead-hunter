import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST(request: Request) {
  try {
    const { keyword, location } = await request.json();

    const industries = keyword.split(',').map((k: string) => k.trim());
    const suburbs = location.split(',').map((l: string) => l.trim());

    // Build the matrix of queries (e.g., "Plumber in Norwood SA", "Roofer in Norwood SA")
    const queries: string[] = [];
    for (const sub of suburbs) {
      for (const ind of industries) {
        queries.push(`${ind} in ${sub}`);
      }
    }

    const WEBHOOK_URL = process.env.NEXT_PUBLIC_APP_URL + '/api/webhooks/outscraper';

    // Send the bulk job to Outscraper asynchronously
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

    if (!response.ok) {
      console.error('Outscraper rejected the request:', data);
      return NextResponse.json({ error: data }, { status: response.status });
    }

    console.log('Outscraper accepted the job. ID:', data.id);

    // Save the job to our DB so the frontend can poll for progress
    const job = await prisma.job.create({
      data: {
        outscraperId: data.id,
        status: 'Running',
        keyword,
        location,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Bulk hunt initiated',
      jobId: job.id, // Return OUR internal ID (not Outscraper's) — used for polling
    });

  } catch (error) {
    console.error('Trigger error:', error);
    return NextResponse.json({ error: 'Failed to start bulk job' }, { status: 500 });
  }
}
