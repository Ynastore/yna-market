import fetch from "node-fetch";
import { kv } from "@vercel/kv";

async function pakasirDetail(order_id, amount) {
  const url = `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(process.env.PAKASIR_SLUG)}&amount=${amount}&order_id=${encodeURIComponent(order_id)}&api_key=${encodeURIComponent(process.env.PAKASIR_APIKEY)}`;
  const r = await fetch(url);
  const j = await r.json();
  return j?.transaction || null;
}

export default async function handler(req, res) {
  const order_id = req.query.order_id;
  if (!order_id) return res.status(400).json({ error: "order_id wajib" });

  const order = await kv.get(`order:${order_id}`);
  if (!order) return res.status(404).json({ error: "Order ID tidak ditemukan" });

  // kalau webhook belum jalan, fallback cek ke pakasir
  if (order.status !== "completed") {
    const trx = await pakasirDetail(order_id, order.amount);
    if (trx?.status === "completed") {
      order.status = "completed";
      order.completed_at = trx.completed_at;
      await kv.set(`order:${order_id}`, order);
    }
  }

  res.json({ ok: true, order });
}
