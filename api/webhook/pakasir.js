export default async function handler(req, res) {
  const { status, order_id } = req.body;

  if (status !== "completed") return res.end();

  const order = global.orders?.[order_id];
  if (!order) return res.end();

  // Kirim ke WA admin
  const text = `Halo min YNA,
Pembayaran BERHASIL ✅

Order: ${order_id}
User: ${order.username}
WA: ${order.wa}
RAM: ${order.ram}

Siap auto create panel.`;

  await fetch(`https://wa.me/${process.env.ADMIN_WA}?text=` + encodeURIComponent(text));

  res.json({ ok: true });
}
