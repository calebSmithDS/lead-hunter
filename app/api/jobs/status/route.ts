import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');

  if (!jobId) {
    return NextResponse.json({ error: 'Missing jobId' }, { status: 400 });
  }

  const job = await prisma.job.findUnique({ where: { id: jobId } });

  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // Count all leads that have been saved since this job started
  // This is our "progress" — it rises in real time as the webhook saves leads
  const leadsCount = await prisma.lead.count({
    where: { createdAt: { gte: job.createdAt } },
  });

  return NextResponse.json({
    status: job.status,       // "Running" | "Done" | "Failed"
    leadsCount,
    keyword: job.keyword,
    location: job.location,
  });
}

