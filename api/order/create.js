export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { type, wa, username, ram, days } = req.body;

  const order_id = "YNA-" + Date.now();
  const amount = ram;

  const pay_url = `https://app.pakasir.com/pay/${process.env.PAKASIR_SLUG}/${amount}?order_id=${order_id}&qris_only=1&redirect=${process.env.BASE_URL}/thanks.html`;

  // simpan order sementara (nanti bisa pakai DB)
  global.orders = global.orders || {};
  global.orders[order_id] = { type, wa, username, ram, days };

  res.json({
    ok: true,
    order_id,
    pay_url
  });
}
