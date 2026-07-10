import { NextResponse } from "next/server";
import { scrapeRecommendations } from "@/lib/scrapers/anime.scraper";
import { getOrSet } from "@/lib/cache";
import { CACHE_TTL } from "@/lib/constants";
import { mapAniListToSlug } from "@/lib/mapper";

export const dynamic = "force-dynamic";

/**
 * GET /api/anime/[slug]/recommendations
 *
 * Returns list of recommended anime cards for a given anime slug.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: any }> },
) {
  try {
    let { slug } = await params;
    if (/^\d+$/.test(slug)) {
      slug = await mapAniListToSlug(Number(slug));
      slug = slug.match.slug;
      if (!slug) {
        return NextResponse.json(
          { ok: false, message: "Anime not found" },
          { status: 404 },
        );
      }
    }
    if (!slug) {
      return NextResponse.json(
        { ok: false, message: "slug is required" },
        { status: 400 },
      );
    }

    const { searchParams } = new URL(req.url);
    const refresh = searchParams.get("refresh") === "1";

    const cacheKey = `anime:recommendations:api:${slug}`;

    const data = refresh
      ? await scrapeRecommendations(slug, true)
      : await getOrSet(
          cacheKey,
          () => scrapeRecommendations(slug),
          CACHE_TTL.ANIME,
        );

    return NextResponse.json({ ok: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[GET /api/anime/[slug]/recommendations]", message);
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
