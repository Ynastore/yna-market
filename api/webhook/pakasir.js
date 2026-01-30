import { kv } from "@vercel/kv";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok:false });

  const body = req.body || {};
  // { amount, order_id, project, status, payment_method, completed_at }
  const order_id = body.order_id;
  if (!order_id) return res.status(400).json({ ok:false });

  const order = await kv.get(`order:${order_id}`);
  if (!order) return res.status(200).json({ ok:true }); // biar webhook gak retry terus

  if (body.status === "completed" && Number(body.amount) === Number(order.amount)) {
    order.status = "completed";
    order.completed_at = body.completed_at || Date.now();
    order.payment_method = body.payment_method;
    await kv.set(`order:${order_id}`, order);
  }

  res.status(200).json({ ok:true });
}
