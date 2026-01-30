export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const { type, wa, username, password, amount } = req.body || {};
    if (!type || !wa || !username || !amount) {
      return res.status(400).json({ error: "Payload kurang lengkap." });
    }

    const slug = process.env.PAKASIR_SLUG;
    const apiKey = process.env.PAKASIR_APIKEY;
    if (!slug || !apiKey) {
      return res.status(500).json({ error: "PAKASIR env belum di-set di Vercel." });
    }

    const order_id =
      "YNA-" +
      Date.now().toString(36).toUpperCase() +
      "-" +
      Math.random().toString(36).slice(2, 7).toUpperCase();

    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt < 1000) {
      return res.status(400).json({ error: "Amount tidak valid." });
    }

    // Create QRIS via Pakasir API
    const r = await fetch("https://app.pakasir.com/api/transactioncreate/qris", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project: slug,
        order_id,
        amount: amt,
        api_key: apiKey,
      }),
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(500).json({ error: data?.message || "Pakasir create gagal." });
    }

    const qr_string = data?.payment?.payment_number; // ini QR string (bukan gambar)
    const total_amount = data?.payment?.amount || amt;

    if (!qr_string) {
      return res.status(500).json({ error: "QR string kosong dari Pakasir." });
    }

    return res.status(200).json({
      order_id,
      amount: total_amount,
      qr_string,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
