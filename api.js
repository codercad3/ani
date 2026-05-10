import axios from "axios";
import express from "express";
import { flix_extract } from "./util.js";

const BASE_URL = "reanime.to";

const app = express();

async function extract_source(id, episode, server) {
  const { data } = await axios.get(
    `https://${BASE_URL}/api/flix/${id}/${episode}`,
  );

  const finalised_server = data.servers.find(
    (serverItem) => serverItem.serverName === server,
  );

  if (!finalised_server) {
    throw new Error(`Server "${server}" not found`);
  }
  const resp = await flix_extract(finalised_server.dataLink);

  return resp;
}

async function extract_servers(id, episode) {
  try {
    const { data } = await axios.get(
      `https://${BASE_URL}/api/flix/${id}/${episode}`,
    );
    return data.servers;
  } catch (error) {
    throw new Error("Error", error);
  }
}

app.get("/servers/:id/:episode", async (req, res) => {
  try {
    const { id, episode } = req.params;
    const servers = await extract_servers(id, episode);
    res.json({
      success: true,
      servers: servers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.get("/sources/:id/:episode/:server_name", async (req, res) => {
  try {
    const { id, episode, server_name } = req.params;

    const resp = await extract_source(id, episode, server_name.toUpperCase());

    res.json({
      success: true,
      data: resp,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
