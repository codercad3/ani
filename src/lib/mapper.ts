import axios from "axios";
import stringSimilarity from "string-similarity";
import * as cheerio from "cheerio";

const ANILIST_URL = "https://graphql.anilist.co";

type AniListFormat =
  | "TV"
  | "TV_SHORT"
  | "MOVIE"
  | "SPECIAL"
  | "OVA"
  | "ONA"
  | "MUSIC"
  | null;

interface AniListMedia {
  id: number;
  format: AniListFormat;
  episodes: number | null;
  seasonYear: number | null;
  title: {
    romaji: string | null;
    english: string | null;
    native: string | null;
  };
}

interface AniKotoResult {
  id: number;
  slug: string;
  url: string;
  title: string;
  japaneseTitle: string;
  type: string;
  episodes: number | null;
  rating: number | null;
}

interface MapperResult {
  anilistId: number;
  anikotoId: number;
  score: number;
  match: AniKotoResult;
}

function normalize(str: any): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getAniListAnime(id: number): Promise<AniListMedia> {
  const query = `
    query ($id:Int){
      Media(id:$id,type:ANIME){
        id
        format
        episodes
        seasonYear
        title{
          romaji
          english
          native
        }
      }
    }
  `;

  const { data } = await axios.post<{
    data: {
      Media: AniListMedia;
    };
  }>(ANILIST_URL, {
    query,
    variables: { id },
  });

  return data.data.Media;
}

async function searchAniKoto(keyword: string): Promise<AniKotoResult[]> {
  const { data } = await axios.get<string>("https://anikoto.cz/filter", {
    params: {
      keyword,
    },
  });

  return parseSearch(data);
}

function parseSearch(html: string): AniKotoResult[] {
  const $ = cheerio.load(html);

  const results: AniKotoResult[] = [];

  $("#list-items .item").each((_, el) => {
    const item = $(el);

    const poster = item.find(".ani");

    const watchUrl = poster.find("a").attr("href") ?? "";

    results.push({
      id: Number(poster.attr("data-tip")),

      slug: watchUrl.match(/watch\/([^/]+)/)?.[1] ?? "",

      url: watchUrl,

      title: item.find(".d-title").text().trim(),

      japaneseTitle: item.find(".d-title").attr("data-jp")?.trim() ?? "",

      type: poster.find(".right").text().trim(),

      episodes:
        Number(item.find(".m-item").eq(1).find("span").text().trim()) || null,

      rating: parseFloat(item.find(".rated span").text().trim()) || null,
    });
  });

  return results;
}

function similarity(a: string | null, b: string | null): number {
  return stringSimilarity.compareTwoStrings(normalize(a), normalize(b));
}

function scoreResult(anilist: AniListMedia, result: AniKotoResult): number {
  const titleScores = [
    similarity(anilist.title.english, result.title),
    similarity(anilist.title.romaji, result.title),
    similarity(anilist.title.native, result.title),

    similarity(anilist.title.english, result.japaneseTitle),
    similarity(anilist.title.romaji, result.japaneseTitle),
    similarity(anilist.title.native, result.japaneseTitle),
  ];

  const titleScore = Math.max(...titleScores);

  let episodeScore = 0.5;

  if (anilist.episodes && result.episodes) {
    if (anilist.episodes === result.episodes) {
      episodeScore = 1;
    } else {
      episodeScore = Math.max(
        0,
        1 - Math.abs(anilist.episodes - result.episodes) / 24,
      );
    }
  }

  const formatMap: Record<Exclude<AniListFormat, null>, string> = {
    TV: "TV",
    TV_SHORT: "TV",
    MOVIE: "Movie",
    SPECIAL: "Special",
    OVA: "OVA",
    ONA: "ONA",
    MUSIC: "Music",
  };

  const expectedType = anilist.format ? formatMap[anilist.format] : undefined;

  const formatScore = expectedType === result.type ? 1 : 0;

  return titleScore * 0.75 + episodeScore * 0.15 + formatScore * 0.1;
}

export async function mapAniListToSlug(
  anilistId: number,
): Promise<MapperResult | null> {
  const anime = await getAniListAnime(anilistId);

  const keyword =
    anime.title.english ?? anime.title.romaji ?? anime.title.native ?? "";

  const results = await searchAniKoto(keyword);

  if (!results.length) return null;

  let best: AniKotoResult | null = null;
  let bestScore = 0;

  for (const result of results) {
    const score = scoreResult(anime, result);

    if (score > bestScore) {
      bestScore = score;
      best = result;
    }
  }

  if (!best) return null;

  return {
    anilistId,
    anikotoId: best.id,
    score: Number(bestScore.toFixed(3)),
    match: best,
  };
}
