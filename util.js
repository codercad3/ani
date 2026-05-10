import axios from "axios";
import * as cheerio from "cheerio";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";

class SubtitleFile {
  lang;
  url;

  constructor(lang, url) {
    this.lang = lang;
    this.url = url;
  }
}

class FlixCloud {
  name;
  mainUrl;
  requiresReferer;

  constructor() {
    this.name = "FlixCloud";
    this.mainUrl = "https://flixcloud.cc";
    this.requiresReferer = false;
  }

  async getUrl(url) {
    const subtitles = [];

    const headers = {
      Referer: `${this.mainUrl}/`,
      "User-Agent": USER_AGENT,
    };

    // Fetch page
    const res = await axios.get(url, { headers });

    const $ = cheerio.load(res.data);

    // Find script containing video_id
    let script = null;

    $("script").each((_, el) => {
      const text = $(el).html();

      if (text && text.includes("video_id")) {
        script = text;
      }
    });

    if (!script) {
      throw new Error("Video script not found");
    }

    // Find data object
    const start = script.indexOf("data:{");

    if (start === -1) {
      throw new Error("Data object not found");
    }

    const from = script.indexOf("{", start);

    let depth = 0;
    let end = -1;

    for (let i = from; i < script.length; i++) {
      if (script[i] === "{") {
        depth++;
      } else if (script[i] === "}") {
        depth--;

        if (depth === 0) {
          end = i;
          break;
        }
      }
    }

    if (end === -1) {
      throw new Error("Invalid object structure");
    }

    const rawData = script.substring(from, end + 1);

    // Convert JS object -> valid JSON
    const fixedJson = rawData.replace(
      /([{,]\s*)([A-Za-z0-9_]+)(\s*:)/g,
      '$1"$2"$3',
    );

    let data;

    try {
      data = JSON.parse(fixedJson);
    } catch (e) {
      console.error("JSON parse failed:", e);
      throw new Error("Failed to parse player data");
    }

    // Subtitles
    if (Array.isArray(data.subtitles)) {
      for (const sub of data.subtitles) {
        subtitles.push(new SubtitleFile(sub.language || "Unknown", sub.url));
      }
    }

    delete data.subtitles;

    // Resolve token
    const resolveRes = await axios.post(
      "https://enc-dec.app/api/dec-reanime?type=resolve",
      {
        data,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    const resolved = resolveRes.data?.result;

    if (!resolved) {
      throw new Error("Failed to resolve token");
    }

    // Fetch m3u8 token response
    const tokenResponse = await axios.get(
      `${this.mainUrl}/api/m3u8/${resolved.token}`,
      {
        headers: {
          Referer: `${this.mainUrl}/`,
          "User-Agent": USER_AGENT,
        },
      },
    );

    // Decrypt stream
    const decryptRes = await axios.post(
      "https://enc-dec.app/api/dec-reanime?type=decrypt",
      {
        data: {
          state: resolveRes.data.result.state,
          token_response: tokenResponse.data,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      },
    );

    const decrypted = decryptRes.data?.result;

    if (!decrypted) {
      throw new Error("Failed to decrypt stream");
    }

    // Return final response
    return {
      source: this.name,
      url: decrypted.stream,
      type: "m3u8",
      subtitles,
    };
  }
}

export async function flix_extract(url) {
  const flix = new FlixCloud();

  return await flix.getUrl(url);
}
