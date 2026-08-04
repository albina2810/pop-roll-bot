const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

const products = [
  {id:1, category:"Популярное", name:"Филадельфия", desc:"Лосось, сливочный сыр, огурец", price:89000, emoji:"🍣"},
  {id:2, category:"Популярное", name:"Spicy Филадельфия", desc:"Лосось, сыр, огурец, соус шрирача", price:95000, emoji:"🔥"},
  {id:3, category:"Роллы", name:"Калифорния с крабом", desc:"Краб, огурец, сливочный сыр, тобико", price:79000, emoji:"🦀"},
  {id:4, category:"Роллы", name:"Лава", desc:"Нежный ролл под фирменным соусом", price:85000, emoji:"🌋"},
  {id:5, category:"Бенто", name:"Бенто-бокс с лососем", desc:"Роллы, закуска и десерт в красивой упаковке", price:159000, emoji:"🍱"},
  {id:6, category:"Напитки", name:"Bubble Tea", desc:"Молочный чай с тапиокой", price:49000, emoji:"🧋"},
  {id:7, category:"Десерты", name:"Моти", desc:"Нежный японский десерт", price:39000, emoji:"🍡"}
];

const categories = ["Все", ...new Set(products.map(p => p.category))];
let activeCategory = "Все";
const cart = new Map();

const productsEl = document.getElementById("products");
const categoriesEl = document.getElementById("categories");
const cartBar = document.getElementById("cartBar");
const cartCount = document.getElementById("cartCount");
const cartTotal = document.getElementById("cartTotal");
const cartModal = document.getElementById("cartModal");
const cartItems = document.getElementById("cartItems");
const checkoutTotal = document.getElementById("checkoutTotal");

const money = n => new Intl.NumberFormat("vi-VN").format(n) + " ₫";

function renderCategories() {
  categoriesEl.innerHTML = categories.map(c =>
    `<button class="cat ${c === activeCategory ? "active" : ""}" data-cat="${c}">${c}</button>`
  ).join("");
  document.querySelectorAll(".cat").forEach(btn => {
    btn.onclick = () => {
      activeCategory = btn.dataset.cat;
      renderCategories();
      renderProducts();
    };
  });
}

function renderProducts() {
  const list = activeCategory === "Все" ? products : products.filter(p => p.category === activeCategory);
  productsEl.innerHTML = list.map(p => `
    <article class="card">
      <div class="product-photo">${p.emoji}</div>
      <div class="card-body">
        <h3>${p.name}</h3>
        <p class="desc">${p.desc}</p>
        <div class="price-row">
          <span class="price">${money(p.price)}</span>
          <button class="add" data-id="${p.id}" aria-label="Добавить">+</button>
        </div>
      </div>
    </article>
  `).join("");
  document.querySelectorAll(".add").forEach(btn => btn.onclick = () => add(Number(btn.dataset.id)));
}

function add(id) {
  cart.set(id, (cart.get(id) || 0) + 1);
  updateCart();
  tg?.HapticFeedback?.impactOccurred("light");
}

function changeQty(id, delta) {
  const next = (cart.get(id) || 0) + delta;
  if (next <= 0) cart.delete(id); else cart.set(id, next);
  updateCart();
  renderCart();
}

function totals() {
  let count = 0, total = 0;
  for (const [id, qty] of cart) {
    const p = products.find(x => x.id === id);
    count += qty;
    total += p.price * qty;
  }
  return {count, total};
}

function updateCart() {
  const {count, total} = totals();
  cartBar.hidden = count === 0;
  cartCount.textContent = count;
  cartTotal.textContent = money(total);
  checkoutTotal.textContent = money(total);
}

function renderCart() {
  if (!cart.size) {
    cartItems.innerHTML = "<p>Корзина пуста</p>";
    return;
  }
  cartItems.innerHTML = [...cart.entries()].map(([id, qty]) => {
    const p = products.find(x => x.id === id);
    return `<div class="cart-item">
      <div><strong>${p.name}</strong><br><small>${money(p.price * qty)}</small></div>
      <div class="qty">
        <button onclick="changeQty(${id},-1)">−</button>
        <b>${qty}</b>
        <button onclick="changeQty(${id},1)">+</button>
      </div>
    </div>`;
  }).join("");
}

cartBar.onclick = () => {
  renderCart();
  cartModal.hidden = false;
};
document.getElementById("closeCart").onclick = () => cartModal.hidden = true;
cartModal.onclick = e => { if (e.target === cartModal) cartModal.hidden = true; };

document.getElementById("sendOrder").onclick = () => {
  const name = document.getElementById("customerName").value.trim();
  const phone = document.getElementById("customerPhone").value.trim();
  const address = document.getElementById("customerAddress").value.trim();
  const comment = document.getElementById("customerComment").value.trim();

  if (!name || !phone || !address) {
    alert("Заполните имя, телефон и адрес доставки.");
    return;
  }

  const {total} = totals();
  const lines = [...cart.entries()].map(([id, qty]) => {
    const p = products.find(x => x.id === id);
    return `${qty} × ${p.name} — ${money(p.price * qty)}`;
  });

  const message = [
    "🍣 Новый заказ Pop Roll",
    "",
    ...lines,
    "",
    `Итого: ${money(total)}`,
    `Имя: ${name}`,
    `Телефон: ${phone}`,
    `Адрес: ${address}`,
    comment ? `Комментарий: ${comment}` : ""
  ].filter(Boolean).join("\n");

  if (tg?.sendData) {
    tg.sendData(JSON.stringify({type:"order", message, total}));
    tg.close();
  } else {
    window.location.href = "https://t.me/PopRollNhaTrangBot?text=" + encodeURIComponent(message);
  }
};

renderCategories();
renderProducts();
updateCart();
