import express from "express";
import crypto from "node:crypto";

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || "");
const PUBLIC_URL = "https://pop-roll-bot-production.up.railway.app";
const MINI_APP_URL = "https://albina2810.github.io/pop-roll-bot/";
const MIN_ORDER = 100000;

const orders = new Map();
let sequence = Math.floor(Date.now() / 1000) % 100000;

const BOT_DESCRIPTION = `🍣 Pop Roll — доставка роллов в Нячанге

🚀 Доставка до двери от 15 минут
🥢 Свежие роллы, суши и бенто-боксы
🧋 Bubble Tea и десерты
❤️ Готовим с любовью

🎉 В честь открытия доставка бесплатно при заказе от 100 000 ₫
🕓 Работаем ежедневно с 16:00 до 00:00`;

const START_MESSAGE = `🍣 Добро пожаловать в семью Pop Roll!

Вкуснейшие роллы и Bubble Tea в Нячанге

Чтобы сделать заказ, нажмите кнопку ниже`;

app.use(express.json({ limit: "300kb" }));

app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const allowedOrigins = ["https://albina2810.github.io", "https://web.telegram.org"];

  if (!origin || allowedOrigins.some((allowed) => origin.startsWith(allowed))) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

function money(value) {
  return new Intl.NumberFormat("vi-VN").format(Number(value || 0)) + " ₫";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function telegram(method, payload = {}) {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN is missing");

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!result.ok) {
    console.error(`Telegram ${method} error:`, result);
    throw new Error(result.description || `Telegram ${method} failed`);
  }

  return result;
}

function validateInitData(initData) {
  if (!BOT_TOKEN || !initData) return null;

  const params = new URLSearchParams(initData);
  const receivedHash = params.get("hash");
  if (!receivedHash) return null;

  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();

  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  const valid = crypto.timingSafeEqual(
    Buffer.from(calculatedHash, "hex"),
    Buffer.from(receivedHash, "hex")
  );

  if (!valid) return null;

  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;

  try {
    return JSON.parse(params.get("user") || "{}");
  } catch {
    return null;
  }
}

function orderLines(order) {
  return order.items.map(
    (item) => `• ${escapeHtml(item.name)} × ${item.quantity} — ${money(item.subtotal)}`
  ).join("\n");
}

function customerConfirmation(order) {
  return `🍣 <b>Подтвердите заказ №${order.id}</b>

${orderLines(order)}

💰 <b>Итого: ${money(order.total)}</b>

👤 ${escapeHtml(order.customer.name)}
📞 ${escapeHtml(order.customer.phone)}
📍 ${escapeHtml(order.customer.address)}
💳 ${escapeHtml(order.payment.label)}
${order.comment ? `💬 ${escapeHtml(order.comment)}` : ""}

Всё верно?`;
}

function adminOrder(order) {
  const username = order.telegramUser.username
    ? `@${escapeHtml(order.telegramUser.username)}`
    : "без username";

  return `🔔 <b>Заказ №${order.id} подтверждён клиентом</b>

👤 ${escapeHtml(order.customer.name)} (${username})
📞 ${escapeHtml(order.customer.phone)}
📍 ${escapeHtml(order.customer.address)}

${orderLines(order)}

💳 ${escapeHtml(order.payment.label)}
${order.comment ? `💬 ${escapeHtml(order.comment)}` : ""}

💰 <b>Итого: ${money(order.total)}</b>`;
}

function clientKeyboard(orderId) {
  return {
    inline_keyboard: [[
      {text: "✅ Да, подтверждаю", callback_data: `client_yes:${orderId}`},
      {text: "❌ Нет, отменить", callback_data: `client_no:${orderId}`}
    ]]
  };
}

function adminKeyboard(orderId, stage = "new") {
  if (stage === "new") {
    return {inline_keyboard: [[
      {text: "✅ Принять", callback_data: `admin_accept:${orderId}`},
      {text: "❌ Отменить", callback_data: `admin_cancel:${orderId}`}
    ]]};
  }
  if (stage === "accepted") {
    return {inline_keyboard: [[
      {text: "👨‍🍳 Готовится", callback_data: `admin_cooking:${orderId}`},
      {text: "❌ Отменить", callback_data: `admin_cancel:${orderId}`}
    ]]};
  }
  if (stage === "cooking") {
    return {inline_keyboard: [[
      {text: "🛵 Курьер выехал", callback_data: `admin_courier:${orderId}`}
    ]]};
  }
  if (stage === "courier") {
    return {inline_keyboard: [[
      {text: "✅ Доставлен", callback_data: `admin_delivered:${orderId}`}
    ]]};
  }
  return {inline_keyboard: []};
}

async function notifyClient(order, text) {
  await telegram("sendMessage", {
    chat_id: order.chatId,
    text,
    parse_mode: "HTML"
  });
}

app.get("/", (_req, res) => {
  res.json({ok: true, service: "Pop Roll bot and orders"});
});

app.get("/health", (_req, res) => {
  res.json({ok: true, pendingOrders: orders.size});
});

app.post("/order", async (req, res) => {
  try {
    const telegramUser = validateInitData(String(req.body?.initData || ""));
    if (!telegramUser?.id) {
      return res.status(401).json({
        ok: false,
        error: "Open the menu from Telegram bot"
      });
    }

    const customer = req.body?.customer || {};
    const payment = req.body?.payment || {};
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const total = Number(req.body?.total || 0);
    const comment = String(req.body?.comment || "").trim().slice(0, 500);

    if (!customer.name || !customer.phone || !customer.address || !items.length) {
      return res.status(400).json({ok: false, error: "Invalid order"});
    }

    const calculatedTotal = items.reduce((sum, item) => {
      const quantity = Math.max(1, Number(item.quantity || 0));
      const unitPrice = Math.max(0, Number(item.unitPrice || 0));
      return sum + quantity * unitPrice;
    }, 0);

    if (calculatedTotal !== total || total < MIN_ORDER) {
      return res.status(400).json({ok: false, error: "Invalid total"});
    }

    sequence += 1;
    const id = String(sequence);
    const order = {
      id,
      chatId: telegramUser.id,
      telegramUser,
      customer: {
        name: String(customer.name).slice(0, 100),
        phone: String(customer.phone).slice(0, 60),
        address: String(customer.address).slice(0, 500)
      },
      payment: {
        code: String(payment.code || ""),
        label: String(payment.label || "").slice(0, 100)
      },
      comment,
      items: items.map((item) => ({
        id: Number(item.id),
        name: String(item.name).slice(0, 100),
        quantity: Math.max(1, Number(item.quantity || 1)),
        unitPrice: Math.max(0, Number(item.unitPrice || 0)),
        subtotal: Math.max(0, Number(item.subtotal || 0))
      })),
      total,
      status: "waiting_client",
      createdAt: new Date().toISOString()
    };

    orders.set(id, order);

    await telegram("sendMessage", {
      chat_id: order.chatId,
      text: customerConfirmation(order),
      parse_mode: "HTML",
      reply_markup: clientKeyboard(id)
    });

    res.json({ok: true, orderId: id, status: order.status});
  } catch (error) {
    console.error("Order error:", error);
    res.status(500).json({ok: false, error: "Order delivery failed"});
  }
});

app.post("/telegram", async (req, res) => {
  res.sendStatus(200);

  try {
    const update = req.body;

    if (update.callback_query) {
      const callback = update.callback_query;
      const [action, id] = String(callback.data || "").split(":");
      const order = orders.get(id);

      await telegram("answerCallbackQuery", {
        callback_query_id: callback.id
      });

      if (!order) {
        await telegram("sendMessage", {
          chat_id: callback.from.id,
          text: "Заказ уже недоступен. Пожалуйста, оформите его заново."
        });
        return;
      }

      if (action === "client_yes") {
        if (callback.from.id !== order.chatId) return;
        order.status = "client_confirmed";

        await telegram("editMessageReplyMarkup", {
          chat_id: order.chatId,
          message_id: callback.message.message_id,
          reply_markup: {inline_keyboard: []}
        });

        await notifyClient(order,
          `✅ <b>Заказ №${order.id} подтверждён</b>\n\nМы передали его оператору. Скоро вы получите подтверждение.`
        );

        await telegram("sendMessage", {
          chat_id: ADMIN_ID,
          text: adminOrder(order),
          parse_mode: "HTML",
          reply_markup: adminKeyboard(id, "new")
        });
        return;
      }

      if (action === "client_no") {
        if (callback.from.id !== order.chatId) return;
        order.status = "cancelled_by_client";

        await telegram("editMessageReplyMarkup", {
          chat_id: order.chatId,
          message_id: callback.message.message_id,
          reply_markup: {inline_keyboard: []}
        });

        await notifyClient(order,
          `❌ Заказ №${order.id} отменён.\n\nНажмите «Меню», чтобы собрать новый заказ.`
        );
        return;
      }

      if (String(callback.from.id) !== ADMIN_ID) return;

      if (action === "admin_accept") {
        order.status = "accepted";
        await notifyClient(order,
          `🎉 <b>Заказ №${order.id} принят!</b>\n\nМы уже начинаем готовить его.\n⏱ Ориентировочное время доставки: 30–45 минут.`
        );
        await telegram("editMessageReplyMarkup", {
          chat_id: ADMIN_ID,
          message_id: callback.message.message_id,
          reply_markup: adminKeyboard(id, "accepted")
        });
        return;
      }

      if (action === "admin_cooking") {
        order.status = "cooking";
        await notifyClient(order,
          `👨‍🍳 <b>Заказ №${order.id} готовится</b>\n\nМы сообщим, когда курьер выедет.`
        );
        await telegram("editMessageReplyMarkup", {
          chat_id: ADMIN_ID,
          message_id: callback.message.message_id,
          reply_markup: adminKeyboard(id, "cooking")
        });
        return;
      }

      if (action === "admin_courier") {
        order.status = "courier";
        await notifyClient(order,
          `🛵 <b>Курьер уже в пути</b>\n\nЗаказ №${order.id} скоро будет у вас.`
        );
        await telegram("editMessageReplyMarkup", {
          chat_id: ADMIN_ID,
          message_id: callback.message.message_id,
          reply_markup: adminKeyboard(id, "courier")
        });
        return;
      }

      if (action === "admin_delivered") {
        order.status = "delivered";
        await notifyClient(order,
          `❤️ <b>Заказ №${order.id} доставлен</b>\n\nСпасибо, что выбрали Pop Roll! Будем рады видеть вас снова.`
        );
        await telegram("editMessageReplyMarkup", {
          chat_id: ADMIN_ID,
          message_id: callback.message.message_id,
          reply_markup: adminKeyboard(id, "done")
        });
        setTimeout(() => orders.delete(id), 60 * 60 * 1000);
        return;
      }

      if (action === "admin_cancel") {
        order.status = "cancelled_by_admin";
        await notifyClient(order,
          `❌ К сожалению, заказ №${order.id} отменён.\n\nМы свяжемся с вами для уточнения деталей.`
        );
        await telegram("editMessageReplyMarkup", {
          chat_id: ADMIN_ID,
          message_id: callback.message.message_id,
          reply_markup: adminKeyboard(id, "done")
        });
        setTimeout(() => orders.delete(id), 60 * 60 * 1000);
      }

      return;
    }

    const message = update.message;
    if (!message?.chat?.id) return;

    const chatId = message.chat.id;
    const text = String(message.text || "");

    if (text.startsWith("/start")) {
      await telegram("sendMessage", {
        chat_id: chatId,
        text: START_MESSAGE,
        reply_markup: {
          inline_keyboard: [[{
            text: "🛍 Открыть меню",
            web_app: {url: MINI_APP_URL}
          }]]
        }
      });
      return;
    }

    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Чтобы сделать заказ, нажмите кнопку ниже",
      reply_markup: {
        inline_keyboard: [[{
          text: "🛍 Открыть меню",
          web_app: {url: MINI_APP_URL}
        }]]
      }
    });
  } catch (error) {
    console.error("Telegram update error:", error);
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
        web_app: {url: MINI_APP_URL}
      }
    });

    await telegram("setMyDescription", {
      description: BOT_DESCRIPTION
    });

    await telegram("setMyShortDescription", {
      short_description: "Семейная доставка роллов и Bubble Tea в Нячанге"
    });

    console.log("Telegram webhook, menu button and descriptions configured");
  } catch (error) {
    console.error("Telegram setup failed:", error);
  }
});
