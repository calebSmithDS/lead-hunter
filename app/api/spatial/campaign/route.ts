import { NextResponse } from 'next/server';
import { Pool } from 'pg';
import { normalizeKeyword } from '@/lib/spatial/normalizer';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export async function POST(request: Request) {
  try {
    const { keyword, geojson } = await request.json();

    if (!keyword || !geojson) {
      return NextResponse.json({ error: 'Missing keyword or GeoJSON polygon' }, { status: 400 });
    }

    const normalized = normalizeKeyword(keyword);
    const geojsonString = JSON.stringify(geojson);

    // ─── 1. Spatial Deduplication Check (30-day window) ─────────────────────
    // PostGIS calculates if an existing campaign for this trade intersects with this new polygon
    const overlapCheckQuery = `
      SELECT 
        id, 
        keyword, 
        "createdAt",
        ROUND(
          (ST_Area(ST_Intersection(geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))::geography) / 
           NULLIF(ST_Area(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)::geography), 0)) * 100
        ) AS overlap_percentage
      FROM "SearchCampaign"
      WHERE "normalizedKeyword" = $2
        AND "createdAt" >= NOW() - INTERVAL '30 days'
        AND ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))
      ORDER BY "createdAt" DESC
      LIMIT 1;
    `;

    const overlapResult = await pool.query(overlapCheckQuery, [geojsonString, normalized]);

    if (overlapResult.rows.length > 0) {
      const prior = overlapResult.rows[0];
      const overlapPct = parseInt(prior.overlap_percentage, 10) || 0;

      // If more than 70% of this drawn territory was already scraped recently
      if (overlapPct >= 70) {
        const daysAgo = Math.round(
          (Date.now() - new Date(prior.createdAt).getTime()) / (1000 * 60 * 60 * 24)
        );
        return NextResponse.json({
          duplicate: true,
          overlapPercentage: overlapPct,
          message: `This territory was already scraped for ${prior.keyword} ${daysAgo} day(s) ago (${overlapPct}% overlap). Duplicate scrape blocked to save API credits.`,
          existingCampaignId: prior.id,
        });
      }
    }

    // ─── 2. PostGIS Spatial Intersection Query ──────────────────────────────
    // Finds all Australian postcodes and localities intersecting the drawn polygon
    const spatialIntersectionQuery = `
      SELECT DISTINCT postcode, suburb, state
      FROM "PostcodeBoundary"
      WHERE ST_Intersects(geom, ST_SetSRID(ST_GeomFromGeoJSON($1), 4326))
      ORDER BY suburb ASC;
    `;

    const matchResult = await pool.query(spatialIntersectionQuery, [geojsonString]);
    const matchedRows = matchResult.rows;

    if (matchedRows.length === 0) {
      return NextResponse.json({
        success: false,
        message: 'No Australian suburbs or postcodes were found inside the drawn polygon. Try zooming in and drawing over inhabited areas.',
        matchedPostcodes: [],
      });
    }

    // Extract unique postcodes and suburb list formatted for Outscraper (e.g. "Norwood SA", "Marion SA")
    const matchedPostcodes = Array.from(new Set(matchedRows.map((r: any) => r.postcode)));
    const matchedSuburbs = matchedRows.map((r: any) => `${r.suburb} ${r.state}`);

    // ─── 3. Save SearchCampaign with Geometry & Deduplication Key ───────────
    const campaignId = `camp_${Date.now()}`;
    const insertCampaignQuery = `
      INSERT INTO "SearchCampaign" (
        "id", "keyword", "normalizedKeyword", "geojson", "geom", "matchedPostcodes", "createdAt", "updatedAt"
      )
      VALUES (
        $1, $2, $3, $4::jsonb, ST_SetSRID(ST_GeomFromGeoJSON($4), 4326), $5, NOW(), NOW()
      )
      RETURNING id;
    `;

    await pool.query(insertCampaignQuery, [
      campaignId,
      keyword,
      normalized,
      geojsonString,
      matchedPostcodes,
    ]);

    return NextResponse.json({
      success: true,
      duplicate: false,
      campaignId,
      normalizedKeyword: normalized,
      suburbCount: matchedSuburbs.length,
      postcodeCount: matchedPostcodes.length,
      matchedSuburbs,
      matchedPostcodes,
    });
  } catch (error: any) {
    console.error('Spatial campaign error:', error);
    return NextResponse.json({ error: error.message || 'Spatial query failed' }, { status: 500 });
  }
}

