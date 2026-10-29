import { NextResponse } from 'next/server';
import { syncOutscraperJob } from '@/lib/outscraper';

export async function POST(request: Request) {
  try {
    const { jobId } = await request.json();

    if (!jobId) {
      return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
    }

    const result = await syncOutscraperJob(jobId);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Job sync error:', error);
    return NextResponse.json({ error: error.message || 'Failed to sync job' }, { status: 500 });
  }
}

