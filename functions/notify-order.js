// Cloudflare Pages Function: POST /notify-order
//
// Приймає структуровані дані замовлення від клієнта, сам формує текст
// повідомлення на сервері (клієнт НЕ може надіслати довільний текст —
// тільки поля замовлення) і відправляє в Telegram, використовуючи
// токен бота із секретних env-змінних Cloudflare (TG_BOT_TOKEN),
// який більше НЕ зберігається у клієнтському коді.
//
// Налаштування (Cloudflare Pages → Settings → Environment variables):
//   TG_BOT_TOKEN  — секрет, токен бота від @BotFather
//   TG_CHAT_IDS   — звичайна змінна, chat_id через кому, напр. "7132928426,537651311,8818256874"

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const TG_TOKEN = env.TG_BOT_TOKEN;
  const TG_CHATIDS = (env.TG_CHAT_IDS || '').split(',').map(s => s.trim()).filter(Boolean);

  if (!TG_TOKEN || !TG_CHATIDS.length) {
    return new Response(JSON.stringify({ ok: false, error: 'Server not configured' }), { status: 500 });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid JSON' }), { status: 400 });
  }

  const { orderNo, name, phone, email, delivery, address, comment, total, source, items } = body;

  // Базова валідація — без цього не приймаємо запит
  if (!orderNo || !name || !phone || !Array.isArray(items) || !items.length) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), { status: 400 });
  }

  const now = new Date().toLocaleString('uk', { timeZone: 'Europe/Kiev' });

  const itemLines = items.map(i =>
    `  • <b>${esc(i.name)}</b>${i.sku ? ` [арт. ${esc(i.sku)}]` : ''} (${esc(i.size)}, наволочки ${esc(i.pillow || '70×70')}${i.fittedSheet ? ', простинь на резинці' : ''}) × ${Number(i.qty) || 1} — ${Number(i.price) > 0 ? (Number(i.price) * Number(i.qty)).toLocaleString('uk') + ' ₴' : 'за домовленістю'}`
  ).join('\n');

  const text = [
    `🛏 <b>Нове замовлення № ${esc(orderNo)}</b>`,
    `🕐 ${now}`,
    `🔎 <b>Джерело:</b> ${esc(source || 'Невідомо')}`,
    ``,
    `👤 <b>Ім'я:</b> ${esc(name)}`,
    `📞 <b>Телефон:</b> ${esc(phone)}`,
    email ? `📧 <b>Email:</b> ${esc(email)}` : null,
    `🚚 <b>Доставка:</b> ${esc(delivery)}`,
    address ? `📍 <b>Адреса:</b> ${esc(address)}` : null,
    ``,
    `🧾 <b>Склад замовлення:</b>`,
    itemLines,
    ``,
    `💰 <b>Разом: ${(Number(total) || 0).toLocaleString('uk')} ₴${items.some(i => !(Number(i.price) > 0)) ? ' + індивідуальні позиції (ціна за домовленістю)' : ''}</b>`,
    comment ? `\n💬 <b>Коментар:</b> ${esc(comment)}` : null,
  ].filter(l => l !== null).join('\n');

  const results = await Promise.all(TG_CHATIDS.map(async chatId => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
      });
      const data = await res.json();
      return !!data.ok;
    } catch (e) {
      return false;
    }
  }));

  if (!results.some(ok => ok)) {
    return new Response(JSON.stringify({ ok: false, error: 'Failed to notify any chat' }), { status: 502 });
  }

  // Фото товарів — не критично, тому не блокуємо відповідь, якщо не вдасться
  const seen = new Set();
  const photos = [];
  items.forEach(i => {
    if (seen.has(i.productId)) return;
    seen.add(i.productId);
    if (i.image && /^https?:\/\//i.test(i.image)) {
      photos.push({ url: i.image, caption: `📦 ${orderNo}: ${i.name}${i.sku ? ` [арт. ${i.sku}]` : ''}` });
    }
  });

  if (photos.length) {
    for (const chatId of TG_CHATIDS) {
      try {
        if (photos.length === 1) {
          await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendPhoto`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, photo: photos[0].url, caption: photos[0].caption }),
          });
        } else {
          for (let off = 0; off < photos.length; off += 10) {
            const chunk = photos.slice(off, off + 10);
            await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMediaGroup`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, media: chunk.map(ph => ({ type: 'photo', media: ph.url, caption: ph.caption })) }),
            });
          }
        }
      } catch (e) { /* фото не критичні */ }
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
