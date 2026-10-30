import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    const leads = await prisma.lead.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(leads);
  } catch (error: any) {
    console.error('Error fetching leads:', error);
    return NextResponse.json({ error: error.message || 'Failed to fetch leads' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { id, status } = await request.json();
    const updatedLead = await prisma.lead.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json(updatedLead);
  } catch (error: any) {
    console.error('Error updating lead status:', error);
    return NextResponse.json({ error: error.message || 'Failed to update status' }, { status: 500 });
  }
}
