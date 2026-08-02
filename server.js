import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;
const PUBLIC_URL = "https://pop-roll-bot-production.up.railway.app";
const MINI_APP_URL = "https://albina2810.github.io/pop-roll-bot/";

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

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

async function telegram(method, payload = {}) {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN is missing");

  const response = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const result = await response.json();
  if (!result.ok) {
    console.error(`Telegram ${method} error:`, result);
    throw new Error(result.description || `Telegram ${method} failed`);
  }
  return result;
}

app.get("/", (_req, res) => {
  res.json({ ok: true, service: "Pop Roll bot and orders" });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

// Telegram sends /start and other updates here.
app.post("/telegram", async (req, res) => {
  res.sendStatus(200);

  try {
    const message = req.body?.message;
    if (!message?.chat?.id) return;

    const chatId = message.chat.id;
    const text = String(message.text || "");

    if (text.startsWith("/start")) {
      await telegram("sendMessage", {
        chat_id: chatId,
        text:
          "🍣 Добро пожаловать в Pop Roll!\n\n" +
          "Свежие роллы и Bubble Tea с доставкой по Нячангу.\n" +
          "Нажмите кнопку ниже, чтобы открыть меню.",
        reply_markup: {
          inline_keyboard: [[
            {
              text: "🛍 Открыть меню",
              web_app: { url: MINI_APP_URL }
            }
          ]]
        }
      });
      return;
    }

    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Нажмите кнопку ниже, чтобы открыть меню Pop Roll.",
      reply_markup: {
        inline_keyboard: [[
          {
            text: "🛍 Открыть меню",
            web_app: { url: MINI_APP_URL }
          }
        ]]
      }
    });
  } catch (error) {
    console.error("Telegram update error:", error);
  }
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

    await telegram("sendMessage", {
      chat_id: ADMIN_ID,
      text: `🆕 НОВЫЙ ЗАКАЗ\n\n${message}`,
      disable_web_page_preview: true
    });

    res.json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      ok: false,
      error: "Order delivery failed"
    });
  }
});

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Pop Roll server is running on port ${PORT}`);

  if (!BOT_TOKEN) {
    console.error("BOT_TOKEN is missing");
    return;
  }

  try {
    await telegram("setWebhook", {
      url: `${PUBLIC_URL}/telegram`,
      drop_pending_updates: true
    });

    await telegram("setChatMenuButton", {
      menu_button: {
        type: "web_app",
        text: "Меню",
        web_app: { url: MINI_APP_URL }
      }
    });

    console.log("Telegram webhook and menu button configured");
  } catch (error) {
    console.error("Telegram setup failed:", error);
  }
});
