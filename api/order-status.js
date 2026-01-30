export default async function handler(req, res) {
  try {
    const slug = process.env.PAKASIR_SLUG;
    const apiKey = process.env.PAKASIR_APIKEY;
    if (!slug || !apiKey) {
      return res.status(500).json({ error: "PAKASIR env belum di-set di Vercel." });
    }

    const { order_id, amount } = req.query || {};
    if (!order_id || !amount) {
      return res.status(400).json({ error: "order_id & amount wajib." });
    }

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1000) {
      return res.status(400).json({ error: "amount tidak valid." });
    }

    const url =
      "https://app.pakasir.com/api/transactiondetail" +
      `?project=${encodeURIComponent(slug)}` +
      `&amount=${encodeURIComponent(String(amt))}` +
      `&order_id=${encodeURIComponent(order_id)}` +
      `&api_key=${encodeURIComponent(apiKey)}`;

    const r = await fetch(url);
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      return res.status(500).json({ error: data?.message || "Pakasir status gagal." });
    }

    const tx = data?.transaction || {};
    const status = tx?.status || "pending";

    return res.status(200).json({
      order: {
        order_id: tx.order_id || order_id,
        amount: tx.amount || amt,
        status, // pending | completed | failed (dll tergantung Pakasir)
        payment_method: tx.payment_method || "qris",
        completed_at: tx.completed_at || null,
      },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
