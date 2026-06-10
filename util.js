import axios from "axios";
import * as cheerio from "cheerio";
import JSON5 from "json5";

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36",
  Referer: "https://flixcloud.cc/",
};

const API = "https://enc-dec.app/api";

function validate(data, path) {
  if (data.status !== 200) {
    console.log(`\n${"-".repeat(25)} API ERROR ${"-".repeat(25)}\n`);
    console.log(`Path: ${path}`);
    console.log(`Status Code: ${data.status}`);
    console.log(`Error: ${data.error || "unknown"}`);
    process.exit(1);
  }

  return data.result;
}

export async function flix_extract() {
  try {
    // Sample flixcloud URL
    const url = "https://flixcloud.cc/e/5o4rjvbx8ad0";

    // Fetch page
    const { data: html } = await axios.get(url, {
      headers: HEADERS,
    });

    const $ = cheerio.load(html);

    // Search all script tags for the embedded data object
    let extracted = null;

    $("script").each((_, el) => {
      const content = $(el).html() || "";

      const match = content.match(
        /type:\s*"data",\s*data:\s*(\{[\s\S]*?\})\s*,\s*uses:/,
      );

      if (match) {
        extracted = match[1];
        return false; // break loop
      }
    });

    if (!extracted) {
      throw new Error("Unable to locate embedded data object");
    }

    const data = JSON5.parse(extracted);

    // Optional subtitles
    const subtitles = data.subtitles || [];
    delete data.subtitles;

    // Resolve stream token
    const decToken = `${API}/dec-flixcloud?type=token`;

    const tokenResponse = await axios.post(
      decToken,
      { data },
      {
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

    const tokenValidated = validate(tokenResponse.data, decToken);

    // Fetch encrypted stream
    const streamUrl = `https://flixcloud.cc/api/m3u8/${tokenValidated.token}`;

    const streamResponse = await axios.get(streamUrl, {
      headers: HEADERS,
    });

    // Decrypt stream
    const decStream = `${API}/dec-flixcloud?type=stream`;

    const streamPayload = {
      data: {
        context: tokenValidated.context,
        stream_response: streamResponse.data,
      },
    };

    const decryptedResponse = await axios.post(decStream, streamPayload, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const streamResolved = validate(decryptedResponse.data, decStream);

    // console.log(`\n${"-".repeat(25)} Decrypted Url ${"-".repeat(25)}\n`);

    // console.log(`Referer: ${HEADERS.Referer}\n`);
    // console.log(streamResolved.stream);

    // if (subtitles.length) {
    //   console.log("\nSubtitles:");
    //   console.log(subtitles);
    // }

    // Get decrypted manifest
    const params = new URLSearchParams({
      url: streamResolved.stream,
      w_payload: streamResolved.context.w_payload,
    });

    // const parseManifest = `${API}/parse-flixcloud?${params}`;
    // const manifestResponse = await axios.get(parseManifest);
    // console.log(`\n${"-".repeat(25)} Decrypted Manifest ${"-".repeat(25)}\n`);
    // console.log(manifestResponse.data);

    const final = { url: streamResolved.stream, subtitles };
    return final;
  } catch (err) {
    console.error("Error:", err.response?.data || err.message);
    return err.message;
  }
}
