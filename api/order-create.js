export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = req.body || {};
    const type = String(body.type || "").trim();

    if (!type) return res.status(400).json({ error: "Payload kurang lengkap: type wajib" });

    // wajib untuk semua transaksi
    const amount = Number(body.amount);
    const wa = String(body.wa || "").trim();

    if (!amount || amount < 1000) return res.status(400).json({ error: "Payload kurang lengkap: amount tidak valid" });
    if (!wa) return res.status(400).json({ error: "Payload kurang lengkap: wa wajib" });

    // validasi spesifik per type
    if (type === "panel") {
      const username = String(body.username || "").trim().toLowerCase();
      const password = String(body.password || "").trim();
      if (!username || !password) {
        return res.status(400).json({ error: "Payload kurang lengkap: username/password wajib untuk panel" });
      }
    }

    if (type === "script") {
      // script minimal: name + product
      const name = String(body.name || "").trim();
      const product = String(body.product || body.script || "").trim();
      if (!name || !product) {
        return res.status(400).json({ error: "Payload kurang lengkap: name + product/script wajib untuk script" });
      }
    }

    if (type === "sewa") {
      const name = String(body.name || "").trim();
      const group = String(body.group || "").trim();
      const bot = String(body.bot || "").trim();
      const duration = String(body.duration || "").trim();
      if (!name || !group || !bot || !duration) {
        return res.status(400).json({ error: "Payload kurang lengkap: name/group/bot/duration wajib untuk sewa" });
      }
    }

    // bikin order_id
    const order_id = makeOrderId(type);

    // create transaksi QRIS ke Pakasir via API
    const pay = await pakasirCreateQRIS({
      project: process.env.PAKASIR_SLUG,
      api_key: process.env.PAKASIR_APIKEY,
      order_id,
      amount
    });

    // respons ke frontend: qr_string untuk dicetak jadi QR
    return res.status(200).json({
      ok: true,
      order_id,
      amount,
      qr_string: pay.payment_number,      // ini QR string
      expired_at: pay.expired_at || null
    });

  } catch (e) {
    console.error("order-create error:", e);
    return res.status(500).json({ error: "Server error: " + (e?.message || "unknown") });
  }
}

function makeOrderId(type){
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  const t = Date.now().toString(36).toUpperCase();
  const prefix = type === "panel" ? "YNA-PNL" : type === "script" ? "YNA-SC" : "YNA-SEWA";
  return `${prefix}-${t}-${rand}`;
}

async function pakasirCreateQRIS({ project, api_key, order_id, amount }){
  if (!project || !api_key) throw new Error("Env PAKASIR_SLUG / PAKASIR_APIKEY belum di-set");

  const url = `https://app.pakasir.com/api/transactioncreate/qris`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project, order_id, amount, api_key })
  });

  const j = await r.json().catch(()=> ({}));
  if (!r.ok) throw new Error(j?.error || j?.message || "Pakasir error");
  if (!j?.payment?.payment_number) throw new Error("Pakasir response invalid (payment_number kosong)");

  return j.payment;
}
