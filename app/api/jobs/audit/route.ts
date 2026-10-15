import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import axios from 'axios';

export async function POST(request: Request) {
  try {
    const { leadId, website } = await request.json();

    if (!leadId || !website) {
      return NextResponse.json({ error: "Missing leadId or website" }, { status: 400 });
    }

    // Ensure URL has a protocol for the Google API
    const urlToTest = website.startsWith('http') ? website : `https://${website}`;

    // Ping Google PageSpeed Insights (Mobile strategy)
    const psiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(urlToTest)}&strategy=mobile&category=performance&category=seo`;
    
    const response = await axios.get(psiUrl);
    const lighthouse = response.data.lighthouseResult;

    // Lighthouse returns scores as decimals (e.g., 0.45). Multiply by 100 for standard 0-100 format.
    const performanceScore = Math.round((lighthouse.categories.performance?.score || 0) * 100);
    const seoScore = Math.round((lighthouse.categories.seo?.score || 0) * 100);
    
    // Largest Contentful Paint (LCP) is returned in milliseconds. Convert to seconds.
    const lcpMs = lighthouse.audits['largest-contentful-paint']?.numericValue || 0;
    const mobileLoadTime = parseFloat((lcpMs / 1000).toFixed(2));

    // Update the record in Neon
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        performanceScore,
        seoScore,
        mobileLoadTime,
        auditStatus: "Audited",
      },
    });

    console.log(`Audited ${website}: Performance ${performanceScore}, LCP ${mobileLoadTime}s`);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error(`Audit failed for website:`, error);
    
    // If the website is dead or blocks bots, catch the failure and update the status
    // so QStash doesn't get stuck infinitely retrying a broken URL
    try {
      const { leadId } = await request.clone().json();
      if (leadId) {
        await prisma.lead.update({
          where: { id: leadId },
          data: { auditStatus: "Failed" },
        });
      }
    } catch (e) {
      // Silent catch
    }

    return NextResponse.json({ error: "Audit failed" }, { status: 500 });
  }
}