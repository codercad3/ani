import axios from "axios";
import * as cheerio from "cheerio";

const BASE_URL = "megaplay.buzz";

export async function extract_fallback(ani_id, ep_num, type) {
  const request_url = `https://${BASE_URL}/stream/ani/${ani_id}/${ep_num}/${type}`;

  const { data } = await axios.get(request_url, {
    headers: {
      Referer: `https://${BASE_URL}/`,
    },
  });

  const $ = cheerio.load(data);

  const data_id = $("#megaplay-player").attr("data-id");

  const { data: resp } = await axios.get(
    `https://${BASE_URL}/stream/getSources?id=${data_id}&id=${data_id}`,
    {
      headers: {
        Referer: request_url,
      },
    },
  );

  return resp;
}
