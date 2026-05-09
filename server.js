// server.js
import express from "express";
import extension from "./ext.js";

const app = express();
const PORT = 3000;

app.use(express.json());

/**
 * Get episodes by anime slug
 * Example:
 * GET /anime/death-note-616q/episodes
 */
app.get("/anime/:slug/episodes", async (req, res) => {
  try {
    const { slug } = req.params;

    const episodes = await extension.getEpisodes(slug);

    res.json({
      success: true,
      total: episodes.length,
      episodes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Get sources for a specific episode
 * Example:
 * GET /episode/123/sources
 */
app.get("/episode/:id/sources", async (req, res) => {
  try {
    const { id } = req.params;

    const sources = await extension.getEpisodeSources(id);

    res.json({
      success: true,
      sources,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

/**
 * Optional combined route
 * Example:
 * GET /anime/death-note-616q
 */
app.get("/anime/:slug", async (req, res) => {
  try {
    const { slug } = req.params;
    sources = await extension.getEpisodeSources(slug);
    res.json({
      success: true,
      anime: slug,
      episodes,
      firstEpisodeSources,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
