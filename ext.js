import * as cheerio from "cheerio";

/* -------------------- CONFIG -------------------- */

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";

const BASE_HEADERS = {
  "User-Agent": USER_AGENT,
  Accept: "text/html, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.5",
  Referer: "https://animekai.la",
};

const TOKEN_API_BASE = "https://enc-dec.app/api";
const BASE_URL = "https://animekai.la";

const pageCache = new Map();

/* -------------------- HELPERS -------------------- */

function buildEpisodeId(animeId, ep, slug, token, langs) {
  return `${animeId}$ep=${ep}$slug=${encodeURIComponent(
    slug,
  )}$token=${encodeURIComponent(token)}$langs=${langs}`;
}

function parseEpisodeId(id) {
  const [animeId, ...parts] = id.split("$");
  const obj = { animeId };

  for (const part of parts) {
    const [k, ...v] = part.split("=");
    obj[k] = v.join("=");
  }

  return obj;
}

/* -------------------- REQUEST -------------------- */

async function requestText(url, headers = {}) {
  const res = await fetch(url, {
    headers: { ...BASE_HEADERS, ...headers },
  });
  return res.text();
}

async function requestJson(url, headers = {}) {
  const res = await fetch(url, {
    headers: { ...BASE_HEADERS, ...headers },
  });
  return res.json();
}

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...BASE_HEADERS,
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(payload),
  });
  return res.json();
}

/* -------------------- TOKEN / DECODE -------------------- */

async function generateKaiToken(text) {
  const data = await requestJson(
    `${TOKEN_API_BASE}/enc-kai?text=${encodeURIComponent(text)}`,
  );
  if (!data?.result) throw new Error("Token generation failed");
  return data.result;
}

async function decodeKaiIframe(text) {
  const data = await postJson(`${TOKEN_API_BASE}/dec-kai`, { text });
  if (!data?.result?.url) throw new Error("Iframe decode failed");
  console.log(data.result);
  return data.result;
}

async function decodeMegaPayload(text) {
  const data = await postJson(`${TOKEN_API_BASE}/dec-mega`, {
    text,
    agent: USER_AGENT,
  });
  console.log(data.result)
  if (!data?.result?.sources) throw new Error("Mega decode failed");
  return data.result;
}

async function extractMegaSources(embedUrl) {
  const mediaUrl = embedUrl.replace("/e/", "/media/");

  const res = await requestJson(mediaUrl, {
    Referer: embedUrl,
  });

  return decodeMegaPayload(res.result);
}

/* -------------------- PAGE -------------------- */

async function fetchAnimePage(animeId) {
  if (!pageCache.has(animeId)) {
    pageCache.set(
      animeId,
      (async () => {
        const url = `${BASE_URL}/watch/${animeId}`;
        const html = await requestText(url);

        const $ = cheerio.load(html);
        return {
          $,
          url,
          aniId: $(".rate-box#anime-rating").attr("data-id") || "",
        };
      })(),
    );
  }

  return pageCache.get(animeId);
}

/* -------------------- MAIN API -------------------- */

const extension = {
  async getEpisodes(animeId) {
    const page = await fetchAnimePage(animeId);

    if (!page.aniId) {
      throw new Error("Failed to get anime internal ID");
    }
    const token = await generateKaiToken(page.aniId);
    const data = await requestJson(
      `${BASE_URL}/ajax/episodes/list?ani_id=${encodeURIComponent(
        page.aniId,
      )}&_=${encodeURIComponent(token)}`,
      {
        "X-Requested-With": "XMLHttpRequest",
        Referer: `${BASE_URL}/watch/${animeId}`,
      },
    );

    if (!data?.result) throw new Error("Episodes fetch failed");

    const $ = cheerio.load(data.result);

    const episodes = $(".eplist ul li a")
      .map((_, el) => {
        const a = $(el);

        const num = parseInt(a.attr("num") || "0");

        return {
          id: buildEpisodeId(
            animeId,
            num,
            a.attr("slug"),
            a.attr("token"),
            a.attr("langs"),
          ),
          number: num,
          title: a.find("span").text().trim() || `Episode ${num}`,
        };
      })
      .get();

    return episodes;
  },

  async getEpisodeServers(episodeId) {
    const parsed = parseEpisodeId(episodeId);

    const token = await generateKaiToken(decodeURIComponent(parsed.token));
    const data = await requestJson(
      `${BASE_URL}/ajax/links/list?token=${encodeURIComponent(
        parsed.token,
      )}&_=${encodeURIComponent(token)}`,
      {
        Referer: `${BASE_URL}/watch/${parsed.animeId}`,
      },
    );
    if (!data?.result) throw new Error("Server list failed");

    const $ = cheerio.load(data.result);

    const servers = [];

    $(".server-items .server").each((_, el) => {
      const s = $(el);

      servers.push({
        id: s.attr("data-lid"),
        name: s.text().trim(),
      });
    });

    return servers;
  },

  async getEpisodeSources(episodeId, server = null, dub = false) {
    console.log("before parsing",episodeId)
    const parsed = parseEpisodeId(episodeId);

    const servers = await this.getEpisodeServers(episodeId);
    if (!servers.length) throw new Error("No servers found");

    // prioritize server
    let selected =
      server &&
      servers.find(
        (s) =>
          s.id === server ||
          s.name.toLowerCase() === String(server).toLowerCase(),
      );

    const ordered = selected
      ? [selected, ...servers.filter((s) => s.id !== selected.id)]
      : servers;

    let lastError;

    for (const s of ordered) {
      try {
        const token = await generateKaiToken(s.id);
        const link = await requestJson(
          `${BASE_URL}/ajax/links/view?id=${encodeURIComponent(
            s.id,
          )}&_=${encodeURIComponent(token)}`,
          {
            Referer: `${BASE_URL}/watch/${parsed.animeId}`,
          },
        );

        const iframe = await decodeKaiIframe(link.result);
        console.log(iframe)
        const media = await extractMegaSources(iframe.url);
        console.log(media)
        return {
          sources: (media.sources || []).map((src) => ({
            url: src.file || src.url,
            quality: src.label || "auto",
            isM3U8: (src.file || "").includes(".m3u8"),
          })),
          subtitles: (media.tracks || []).map((t) => ({
            url: t.file,
            lang: t.label || "Unknown",
          })),
          headers: {
            Referer: new URL(iframe.url).origin + "/",
            "User-Agent": USER_AGENT,
          },
        };
      } catch (err) {
        lastError = err;
        console.warn("Server failed:", s.name);
      }
    }

    throw lastError || new Error("All servers failed");
  },
};

export default extension;
