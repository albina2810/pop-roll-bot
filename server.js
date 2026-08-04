import express from "express";
import crypto from "node:crypto";

const app = express();
const PORT = process.env.PORT || 3000;
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_ID = String(process.env.ADMIN_ID || "");
const KITCHEN_CHAT_ID = String(process.env.KITCHEN_CHAT_ID || "");
const COURIER_CHAT_ID = String(process.env.COURIER_CHAT_ID || "");
const PUBLIC_URL = "https://pop-roll-bot-production.up.railway.app";
const MINI_APP_URL = "https://albina2810.github.io/pop-roll-bot/";
const MIN_ORDER = 100000;

const orders = new Map();
let sequence = Math.floor(Date.now() / 1000) % 100000;

const VI_PRODUCT_NAMES = {
  1: "Philadelphia Classic",
  2: "Philadelphia Avocado",
  3: "Philadelphia Fire",
  4: "Lava Salmon",
  5: "Bonito Roll",
  6: "California Tôm",
  7: "California Cua",
  8: "Lava Crab",
  9: "Caesar Chicken Roll",
  10: "Teriyaki Chicken Roll",
  11: "Sake Maki",
  12: "Ebi Maki",
  13: "Kani Maki",
  14: "Kappa Maki",
  15: "Avocado Maki",
  16: "Sake Nigiri",
  17: "Aburi Spicy Nigiri",
  18: "Đào Chanh Dây",
  19: "Đào Dâu",
  20: "Đào Cổ Điển",
  21: "Vải Dâu",
  22: "Dâu Boom"
};

const BOT_DESCRIPTIONS = {
  ru: `🍣 Pop Roll — доставка роллов в Нячанге\n\n🚀 Доставка до двери от 15 минут\n🥢 Свежие роллы, суши и бенто-боксы\n🧋 Bubble Tea и десерты\n❤️ Готовим с любовью\n\n🎉 В честь открытия доставка бесплатно при заказе от 100 000 ₫\n🕓 Работаем ежедневно с 16:00 до 00:00`,
  vi: `🍣 Pop Roll — giao sushi cuộn tại Nha Trang\n\n🚀 Giao tận cửa từ 15 phút\n🥢 Sushi cuộn, sushi và bento tươi ngon\n🧋 Bubble Tea và món tráng miệng\n❤️ Được chuẩn bị bằng cả tình yêu\n🎉 Mừng khai trương: miễn phí giao hàng cho đơn từ 100.000 ₫\n🕓 Mở cửa hằng ngày từ 16:00 đến 00:00`
};

const START_MESSAGES = {
  ru: `🍣 Добро пожаловать в семью Pop Roll!\n\nВкуснейшие роллы и Bubble Tea в Нячанге\n\nЧтобы сделать заказ, нажмите кнопку ниже`,
  vi: `🍣 Chào mừng bạn đến với gia đình Pop Roll!\n\nSushi cuộn và Bubble Tea thơm ngon tại Nha Trang\n\nĐể đặt món, hãy nhấn nút bên dưới`
};

function userLanguage(languageCode = "") {
  return String(languageCode).toLowerCase().startsWith("vi") ? "vi" : "ru";
}
function menuButtonText(language) {
  return language === "vi" ? "🛍 Mở thực đơn" : "🛍 Открыть меню";
}
function fallbackMessage(language) {
  return language === "vi" ? "Để đặt món, hãy nhấn nút bên dưới" : "Чтобы сделать заказ, нажмите кнопку ниже";
}

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
function orderLanguage(order) {
  return order?.language === "vi" ? "vi" : "ru";
}
function clientText(order, ru, vi) {
  return orderLanguage(order) === "vi" ? vi : ru;
}
function paymentLabel(code, language) {
  if (code === "cash") return language === "vi" ? "Tiền mặt" : "Наличными";
  if (code === "qr") return language === "vi" ? "Chuyển khoản QR" : "Перевод по QR";
  return language === "vi" ? "Thanh toán" : "Оплата";
}
function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
async function telegram(method, payload = {}) {
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN is missing");
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${k}=${v}`).join("\n");
  const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  try {
    if (!crypto.timingSafeEqual(Buffer.from(calculatedHash, "hex"), Buffer.from(receivedHash, "hex"))) return null;
  } catch { return null; }
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
  try { return JSON.parse(params.get("user") || "{}"); } catch { return null; }
}

function orderLines(order, vietnamese = false) {
  return order.items.map((item) => {
    const name = vietnamese ? (VI_PRODUCT_NAMES[item.id] || item.name) : item.name;
    return `• ${escapeHtml(name)} × ${item.quantity} — ${money(item.subtotal)}`;
  }).join("\n");
}
function customerConfirmation(order) {
  const vi = orderLanguage(order) === "vi";
  return vi
    ? `🍣 <b>Xác nhận đơn hàng #${order.id}</b>\n\n${orderLines(order)}\n\n💰 <b>Tổng cộng: ${money(order.total)}</b>\n👤 ${escapeHtml(order.customer.name)}\n📞 ${escapeHtml(order.customer.phone)}\n📍 ${escapeHtml(order.customer.address)}\n💳 ${escapeHtml(order.payment.label)}\n${order.comment ? `💬 ${escapeHtml(order.comment)}` : ""}\n\nThông tin trên đã chính xác chưa?`
    : `🍣 <b>Подтвердите заказ №${order.id}</b>\n\n${orderLines(order)}\n\n💰 <b>Итого: ${money(order.total)}</b>\n👤 ${escapeHtml(order.customer.name)}\n📞 ${escapeHtml(order.customer.phone)}\n📍 ${escapeHtml(order.customer.address)}\n💳 ${escapeHtml(order.payment.label)}\n${order.comment ? `💬 ${escapeHtml(order.comment)}` : ""}\n\nВсё верно?`;
}
function adminOrder(order) {
  const username = order.telegramUser?.username ? `@${escapeHtml(order.telegramUser.username)}` : (order.source === "web" ? "Zalo / сайт" : "без username");
  return `🔔 <b>Заказ №${order.id}</b>\nИсточник: ${username}\n👤 ${escapeHtml(order.customer.name)}\n📞 ${escapeHtml(order.customer.phone)}\n📍 ${escapeHtml(order.customer.address)}\n\n${orderLines(order)}\n\n💳 ${escapeHtml(order.payment.label)}\n${order.comment ? `💬 ${escapeHtml(order.comment)}` : ""}\n\n💰 <b>Итого: ${money(order.total)}</b>`;
}
function kitchenOrder(order) {
  return `🔔 <b>ĐƠN HÀNG MỚI #${order.id}</b>\n\n${orderLines(order, true)}\n\n${order.comment ? `💬 Ghi chú: ${escapeHtml(order.comment)}\n` : ""}💰 Tổng cộng: ${money(order.total)}\n⏱ Hoàn thành dự kiến: 30–40 phút\n\n📦 Ghi rõ mã đơn <b>#${order.id}</b> trên túi.`;
}
function courierPreview(order) {
  return `🛵 <b>SẮP CÓ ĐƠN #${order.id}</b>\n\n⏱ Dự kiến sẵn sàng sau 30–40 phút.\n📍 Điểm nhận: Pop Roll\n💰 ${escapeHtml(order.payment.label)} — ${money(order.total)}\n\nVui lòng chuẩn bị đến nhận đơn đúng giờ.`;
}
function courierReady(order) {
  return `✅ <b>ĐƠN #${order.id} ĐÃ SẴN SÀNG</b>\n\n👤 Khách hàng: ${escapeHtml(order.customer.name)}\n📞 ${escapeHtml(order.customer.phone)}\n📍 ${escapeHtml(order.customer.address)}\n💳 ${escapeHtml(order.payment.label)}\n💰 ${money(order.total)}\n${order.comment ? `💬 Ghi chú: ${escapeHtml(order.comment)}\n` : ""}\n📦 Kiểm tra túi có mã <b>#${order.id}</b>.`;
}
function clientKeyboard(order) {
  const vi = orderLanguage(order) === "vi";
  return { inline_keyboard: [[
    { text: vi ? "✅ Đồng ý, xác nhận" : "✅ Да, подтверждаю", callback_data: `client_yes:${order.id}` },
    { text: vi ? "❌ Không, hủy đơn" : "❌ Нет, отменить", callback_data: `client_no:${order.id}` }
  ]] };
}
function adminKeyboard(orderId, stage = "new") {
  if (stage === "new") return { inline_keyboard: [[
    { text: "✅ Принять", callback_data: `admin_accept:${orderId}` },
    { text: "❌ Отменить", callback_data: `admin_cancel:${orderId}` }
  ]] };
  if (stage === "accepted" || stage === "cooking" || stage === "ready") return { inline_keyboard: [[
    { text: "❌ Отменить", callback_data: `admin_cancel:${orderId}` }
  ]] };
  return { inline_keyboard: [] };
}
function kitchenKeyboard(orderId, stage = "new") {
  if (stage === "new") return { inline_keyboard: [[
    { text: "👨‍🍳 Bắt đầu làm", callback_data: `kitchen_start:${orderId}` }
  ]] };
  if (stage === "cooking") return { inline_keyboard: [[
    { text: "✅ Đã xong", callback_data: `kitchen_ready:${orderId}` }
  ]] };
  return { inline_keyboard: [] };
}
function courierKeyboard(orderId, stage = "ready") {
  if (stage === "ready") return { inline_keyboard: [[
    { text: "🙋 Tôi nhận đơn", callback_data: `courier_claim:${orderId}` }
  ]] };
  if (stage === "claimed") return { inline_keyboard: [[
    { text: "📦 Đã lấy hàng", callback_data: `courier_picked:${orderId}` }
  ]] };
  if (stage === "picked") return { inline_keyboard: [[
    { text: "🛵 Đang giao", callback_data: `courier_delivering:${orderId}` }
  ]] };
  if (stage === "delivering") return { inline_keyboard: [[
    { text: "✅ Đã giao", callback_data: `courier_delivered:${orderId}` }
  ]] };
  return { inline_keyboard: [] };
}
async function notifyClient(order, text) {
  if (!order.chatId) return;
  await telegram("sendMessage", { chat_id: order.chatId, text, parse_mode: "HTML" });
}
async function editKeyboard(chatId, messageId, replyMarkup) {
  if (!chatId || !messageId) return;
  await telegram("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: replyMarkup });
}
async function sendAdmin(order) {
  const result = await telegram("sendMessage", { chat_id: ADMIN_ID, text: adminOrder(order), parse_mode: "HTML", reply_markup: adminKeyboard(order.id, "new") });
  order.adminMessageId = result.result.message_id;
}

app.get("/", (_req, res) => res.json({ ok: true, service: "Pop Roll bot and orders" }));
app.get("/health", (_req, res) => res.json({ ok: true, pendingOrders: orders.size, kitchenConfigured: Boolean(KITCHEN_CHAT_ID), courierConfigured: Boolean(COURIER_CHAT_ID) }));

app.post("/order", async (req, res) => {
  try {
    const telegramUser = validateInitData(String(req.body?.initData || ""));
    const customer = req.body?.customer || {};
    const payment = req.body?.payment || {};
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const total = Number(req.body?.total || 0);
    const comment = String(req.body?.comment || "").trim().slice(0, 500);
    if (!customer.name || !customer.phone || !customer.address || !items.length) return res.status(400).json({ ok: false, error: "Invalid order" });
    const calculatedTotal = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 0)) * Math.max(0, Number(item.unitPrice || 0)), 0);
    if (calculatedTotal !== total || total < MIN_ORDER) return res.status(400).json({ ok: false, error: "Invalid total" });

    sequence += 1;
    const id = String(sequence);
    const language = req.body?.language === "vi" ? "vi" : "ru";
    const order = {
      id,
      chatId: telegramUser?.id || null,
      telegramUser: telegramUser || {},
      source: telegramUser?.id ? "telegram" : "web",
      customer: { name: String(customer.name).slice(0,100), phone: String(customer.phone).slice(0,60), address: String(customer.address).slice(0,500) },
      language,
      payment: { code: String(payment.code || ""), label: paymentLabel(String(payment.code || ""), language) },
      comment,
      items: items.map(item => ({ id: Number(item.id), name: String(item.name).slice(0,100), quantity: Math.max(1, Number(item.quantity || 1)), unitPrice: Math.max(0, Number(item.unitPrice || 0)), subtotal: Math.max(0, Number(item.subtotal || 0)) })),
      total,
      status: telegramUser?.id ? "waiting_client" : "client_confirmed",
      createdAt: new Date().toISOString(),
      courierUserId: null
    };
    orders.set(id, order);

    if (order.chatId) {
      await telegram("sendMessage", { chat_id: order.chatId, text: customerConfirmation(order), parse_mode: "HTML", reply_markup: clientKeyboard(order) });
    } else {
      await sendAdmin(order);
    }
    res.json({ ok: true, orderId: id, status: order.status, source: order.source });
  } catch (error) {
    console.error("Order error:", error);
    res.status(500).json({ ok: false, error: "Order delivery failed" });
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
      await telegram("answerCallbackQuery", { callback_query_id: callback.id });
      if (!order) {
        await telegram("sendMessage", { chat_id: callback.from.id, text: callback.from.language_code?.startsWith("vi") ? "Đơn hàng không còn khả dụng." : "Заказ уже недоступен." });
        return;
      }

      if (action === "client_yes") {
        if (callback.from.id !== order.chatId) return;
        order.status = "client_confirmed";
        await editKeyboard(order.chatId, callback.message.message_id, { inline_keyboard: [] });
        await notifyClient(order, clientText(order, `✅ <b>Заказ №${order.id} подтверждён</b>\n\nМы передали его оператору.`, `✅ <b>Đơn hàng #${order.id} đã được xác nhận</b>\n\nChúng tôi đã chuyển đơn cho nhân viên.`));
        await sendAdmin(order);
        return;
      }
      if (action === "client_no") {
        if (callback.from.id !== order.chatId) return;
        order.status = "cancelled_by_client";
        await editKeyboard(order.chatId, callback.message.message_id, { inline_keyboard: [] });
        await notifyClient(order, clientText(order, `❌ Заказ №${order.id} отменён.`, `❌ Đơn hàng #${order.id} đã bị hủy.`));
        return;
      }

      if (action.startsWith("admin_")) {
        if (String(callback.from.id) !== ADMIN_ID) return;
        if (action === "admin_accept") {
          order.status = "accepted";
          await editKeyboard(ADMIN_ID, callback.message.message_id, adminKeyboard(id, "accepted"));
          await notifyClient(order, clientText(order, `🎉 <b>Заказ №${order.id} принят!</b>\n\n⏱ Ориентировочное время доставки: 30–45 минут.`, `🎉 <b>Đơn hàng #${order.id} đã được tiếp nhận!</b>\n\n⏱ Thời gian giao dự kiến: 30–45 phút.`));
          if (KITCHEN_CHAT_ID) {
            const r = await telegram("sendMessage", { chat_id: KITCHEN_CHAT_ID, text: kitchenOrder(order), parse_mode: "HTML", reply_markup: kitchenKeyboard(id, "new") });
            order.kitchenMessageId = r.result.message_id;
          }
          if (COURIER_CHAT_ID) {
            const r = await telegram("sendMessage", { chat_id: COURIER_CHAT_ID, text: courierPreview(order), parse_mode: "HTML" });
            order.courierPreviewMessageId = r.result.message_id;
          }
          return;
        }
        if (action === "admin_cancel") {
          order.status = "cancelled_by_admin";
          await editKeyboard(ADMIN_ID, callback.message.message_id, { inline_keyboard: [] });
          if (order.kitchenMessageId && KITCHEN_CHAT_ID) await editKeyboard(KITCHEN_CHAT_ID, order.kitchenMessageId, { inline_keyboard: [] });
          if (order.courierMessageId && COURIER_CHAT_ID) await editKeyboard(COURIER_CHAT_ID, order.courierMessageId, { inline_keyboard: [] });
          await notifyClient(order, clientText(order, `❌ К сожалению, заказ №${order.id} отменён.`, `❌ Rất tiếc, đơn hàng #${order.id} đã bị hủy.`));
          return;
        }
      }

      if (action === "kitchen_start") {
        if (String(callback.message.chat.id) !== KITCHEN_CHAT_ID) return;
        order.status = "cooking";
        await editKeyboard(KITCHEN_CHAT_ID, callback.message.message_id, kitchenKeyboard(id, "cooking"));
        await notifyClient(order, clientText(order, `👨‍🍳 <b>Заказ №${order.id} готовится</b>`, `👨‍🍳 <b>Đơn hàng #${order.id} đang được chuẩn bị</b>`));
        await telegram("sendMessage", { chat_id: ADMIN_ID, text: `👨‍🍳 Кухня начала готовить заказ №${order.id}` });
        return;
      }
      if (action === "kitchen_ready") {
        if (String(callback.message.chat.id) !== KITCHEN_CHAT_ID) return;
        order.status = "ready";
        await editKeyboard(KITCHEN_CHAT_ID, callback.message.message_id, { inline_keyboard: [] });
        await telegram("sendMessage", { chat_id: ADMIN_ID, text: `✅ Заказ №${order.id} готов. Курьеру отправлен адрес.` });
        if (COURIER_CHAT_ID) {
          const r = await telegram("sendMessage", { chat_id: COURIER_CHAT_ID, text: courierReady(order), parse_mode: "HTML", reply_markup: courierKeyboard(id, "ready") });
          order.courierMessageId = r.result.message_id;
        }
        return;
      }

      if (action === "courier_claim") {
        if (String(callback.message.chat.id) !== COURIER_CHAT_ID) return;
        if (order.courierUserId && order.courierUserId !== callback.from.id) {
          await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: "Đơn này đã có tài xế nhận.", show_alert: true });
          return;
        }
        order.courierUserId = callback.from.id;
        order.courierName = [callback.from.first_name, callback.from.last_name].filter(Boolean).join(" ") || callback.from.username || "Tài xế";
        order.status = "courier_claimed";
        await editKeyboard(COURIER_CHAT_ID, callback.message.message_id, courierKeyboard(id, "claimed"));
        await telegram("sendMessage", { chat_id: ADMIN_ID, text: `🙋 Курьер ${order.courierName} взял заказ №${order.id}` });
        return;
      }
      if (["courier_picked","courier_delivering","courier_delivered"].includes(action)) {
        if (String(callback.message.chat.id) !== COURIER_CHAT_ID) return;
        if (order.courierUserId !== callback.from.id) {
          await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: "Chỉ tài xế đã nhận đơn mới được bấm.", show_alert: true });
          return;
        }
        if (action === "courier_picked") {
          order.status = "picked";
          await editKeyboard(COURIER_CHAT_ID, callback.message.message_id, courierKeyboard(id, "picked"));
          await telegram("sendMessage", { chat_id: ADMIN_ID, text: `📦 Курьер забрал заказ №${order.id}` });
          return;
        }
        if (action === "courier_delivering") {
          order.status = "delivering";
          await editKeyboard(COURIER_CHAT_ID, callback.message.message_id, courierKeyboard(id, "delivering"));
          await notifyClient(order, clientText(order, `🛵 <b>Курьер уже в пути</b>\n\nЗаказ №${order.id} скоро будет у вас.`, `🛵 <b>Tài xế đang trên đường giao hàng</b>\n\nĐơn hàng #${order.id} sẽ sớm đến nơi.`));
          await telegram("sendMessage", { chat_id: ADMIN_ID, text: `🛵 Заказ №${order.id} едет к клиенту` });
          return;
        }
        if (action === "courier_delivered") {
          order.status = "delivered";
          await editKeyboard(COURIER_CHAT_ID, callback.message.message_id, { inline_keyboard: [] });
          await notifyClient(order, clientText(order, `❤️ <b>Заказ №${order.id} доставлен</b>\n\nСпасибо, что выбрали Pop Roll!`, `❤️ <b>Đơn hàng #${order.id} đã được giao</b>\n\nCảm ơn bạn đã chọn Pop Roll!`));
          await telegram("sendMessage", { chat_id: ADMIN_ID, text: `✅ Заказ №${order.id} доставлен` });
          setTimeout(() => orders.delete(id), 60 * 60 * 1000);
          return;
        }
      }
      return;
    }

    const message = update.message;
    if (!message?.chat?.id) return;
    const chatId = message.chat.id;
    const text = String(message.text || "");
    const language = userLanguage(message.from?.language_code);

    if (text.startsWith("/chatid")) {
      await telegram("sendMessage", { chat_id: chatId, text: `CHAT_ID = ${chatId}` });
      return;
    }
    if (message.chat.type !== "private") return;
    if (text.startsWith("/start")) {
      await telegram("sendMessage", { chat_id: chatId, text: START_MESSAGES[language], reply_markup: { inline_keyboard: [[{ text: menuButtonText(language), web_app: { url: MINI_APP_URL } }]] } });
      return;
    }
    await telegram("sendMessage", { chat_id: chatId, text: fallbackMessage(language), reply_markup: { inline_keyboard: [[{ text: menuButtonText(language), web_app: { url: MINI_APP_URL } }]] } });
  } catch (error) {
    console.error("Telegram update error:", error);
  }
});

app.listen(PORT, "0.0.0.0", async () => {
  console.log(`Pop Roll server is running on port ${PORT}`);
  if (!BOT_TOKEN) return console.error("BOT_TOKEN is missing");
  try {
    await telegram("setWebhook", { url: `${PUBLIC_URL}/telegram`, drop_pending_updates: true });
    await telegram("setChatMenuButton", { menu_button: { type: "web_app", text: "Меню", web_app: { url: MINI_APP_URL } } });
    await telegram("setMyDescription", { description: BOT_DESCRIPTIONS.ru });
    await telegram("setMyDescription", { description: BOT_DESCRIPTIONS.vi, language_code: "vi" });
    await telegram("setMyShortDescription", { short_description: "Семейная доставка роллов и Bubble Tea в Нячанге" });
    await telegram("setMyShortDescription", { short_description: "Giao sushi cuộn và Bubble Tea gia đình tại Nha Trang", language_code: "vi" });
    console.log("Telegram webhook and order workflow configured");
  } catch (error) {
    console.error("Telegram setup failed:", error);
  }
});
