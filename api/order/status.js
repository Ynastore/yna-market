export default async function handler(req, res){
  const order_id = req.query.order_id;
  if(!order_id) return res.status(400).json({ error:"order_id wajib" });

  // ambil order dari memory (minimal)
  const order = global.orders?.[order_id];

  // cek status via Pakasir transaction detail
  const project = process.env.PAKASIR_SLUG;
  const api_key = process.env.PAKASIR_APIKEY;

  // amount wajib untuk transactiondetail
  // kalau order belum ada (misal server restart), kamu bisa simpan order ke DB nanti.
  if(!order) {
    return res.json({ ok:true, status:"pending", order:null });
  }

  const amount = order.ram;

  const url =
    `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(project)}` +
    `&amount=${encodeURIComponent(amount)}` +
    `&order_id=${encodeURIComponent(order_id)}` +
    `&api_key=${encodeURIComponent(api_key)}`;

  const r = await fetch(url);
  const data = await r.json();

  const status = data?.transaction?.status || "pending";

  // sesuai docs: status "completed"
  // kalau selain completed anggap pending/failed
  let st = "pending";
  if(status === "completed") st = "completed";
  else if(status === "failed" || status === "canceled" || status === "cancelled") st = "failed";

  // ini baru boleh muncul jika completed
  const reveal = (st === "completed") ? {
    panel_url: process.env.PTERO_DOMAIN, // nanti setelah auto-create, bisa kasih link login + credential
    buyer_group: process.env.BUYER_GROUP_LINK
  } : null;

  return res.json({ ok:true, status: st, order, reveal });
}
