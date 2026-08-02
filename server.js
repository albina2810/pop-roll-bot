import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

app.use(express.json({ limit: "200kb" }));

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const allowedOrigins = [
    "https://albina2810.github.io",
    "https://web.telegram.org"
  ];

  if (!origin || allowedOrigins.some((allowed) => origin.startsWith(allowed))) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "Pop Roll orders" });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/order", async (req, res) => {
  try {
    if (!BOT_TOKEN || !ADMIN_ID) {
      return res.status(500).json({
        ok: false,
        error: "Server variables are not configured"
      });
    }

    const message = String(req.body?.message || "").trim();

    if (!message || message.length > 3900) {
      return res.status(400).json({
        ok: false,
        error: "Invalid order message"
      });
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ADMIN_ID,
          text: `🆕 НОВЫЙ ЗАКАЗ\n\n${message}`,
          disable_web_page_preview: true
        })
      }
    );

    const result = await telegramResponse.json();

    if (!result.ok) {
      console.error("Telegram error:", result);
      return res.status(502).json({
        ok: false,
        error: "Telegram delivery failed"
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: "Internal server error"
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Pop Roll order server is running on port ${PORT}`);
});
