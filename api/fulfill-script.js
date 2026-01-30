export default async function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const {
      order_id,
      amount,
      wa,
      name,
      product, // "sc_store" | "sc_md" | "sc_yna_ai"
    } = req.body || {};

    if (!order_id || !amount || !product) {
      return res.status(400).json({ error: "Payload kurang: order_id, amount, product wajib." });
    }

    // ==== ENV ====
    const PAKASIR_SLUG = process.env.PAKASIR_SLUG;
    const PAKASIR_APIKEY = process.env.PAKASIR_APIKEY;

    const ADMIN_WA = process.env.ADMIN_WA || "6283173403262";
    const BUYER_GROUP_LINK =
      process.env.BUYER_GROUP_LINK || "https://chat.whatsapp.com/GSlHNKIDJJoIPGhOp5zoWs";

    // Link download kamu taruh di env supaya aman & gampang ganti
    const SCRIPT_URL_SC_STORE = process.env.SCRIPT_URL_SC_STORE;   // contoh: https://cdn-kamu.com/sc_store.zip
    const SCRIPT_URL_SC_MD = process.env.SCRIPT_URL_SC_MD;         // contoh: https://cdn-kamu.com/sc_md.zip
    const SCRIPT_URL_SC_YNA_AI = process.env.SCRIPT_URL_SC_YNA_AI; // contoh: https://cdn-kamu.com/sc_yna_ai.zip

    if (!PAKASIR_SLUG || !PAKASIR_APIKEY) {
      return res.status(500).json({ error: "ENV Pakasir belum di-set (PAKASIR_SLUG / PAKASIR_APIKEY)." });
    }

    // ==== 1) VALIDASI STATUS KE PAKASIR (WAJIB COMPLETED) ====
    const detailUrl =
      `https://app.pakasir.com/api/transactiondetail` +
      `?project=${encodeURIComponent(PAKASIR_SLUG)}` +
      `&amount=${encodeURIComponent(Number(amount))}` +
      `&order_id=${encodeURIComponent(order_id)}` +
      `&api_key=${encodeURIComponent(PAKASIR_APIKEY)}`;

    const dr = await fetch(detailUrl, { method: "GET" });
    const dj = await dr.json();

    if (!dr.ok) {
      return res.status(400).json({
        error: "Gagal cek status Pakasir",
        pakasir: dj,
      });
    }

    const tx = dj?.transaction;
    if (!tx) {
      return res.status(404).json({ error: "Transaksi tidak ditemukan di Pakasir." });
    }

    if (tx.status !== "completed") {
      return res.status(409).json({
        error: `Transaksi belum completed (status: ${tx.status}).`,
        status: tx.status,
      });
    }

    // ==== 2) MAPPING PRODUK -> NAMA + LINK ZIP ====
    const map = {
      sc_store: {
        name: "SC STORE — BOT KHUSUS JUALAN",
        url: SCRIPT_URL_SC_STORE,
        price: 120000,
      },
      sc_md: {
        name: "SC MD (Multi Device) — 1000+ fitur",
        url: SCRIPT_URL_SC_MD,
        price: 150000,
      },
      sc_yna_ai: {
        name: "SC YNA AI — BOT PALING CANGGIH",
        url: SCRIPT_URL_SC_YNA_AI,
        price: 180000,
      },
    };

    const item = map[product];
    if (!item) return res.status(400).json({ error: "Product tidak dikenal." });
    if (!item.url) {
      return res.status(500).json({
        error: `Link download untuk ${product} belum di-set di ENV.`,
        need_env: product === "sc_store"
          ? "SCRIPT_URL_SC_STORE"
          : product === "sc_md"
          ? "SCRIPT_URL_SC_MD"
          : "SCRIPT_URL_SC_YNA_AI",
      });
    }

    // (opsional) validasi nominal biar gak diakalin
    // kalau mau strict, aktifin:
    // if (Number(amount) !== item.price) {
    //   return res.status(400).json({ error: "Nominal tidak sesuai produk." });
    // }

    // ==== 3) BALIKKAN DATA KE FRONTEND ====
    return res.status(200).json({
      ok: true,
      order_id,
      amount: Number(amount),
      product: product,
      product_name: item.name,
      download_url: item.url,
      buyer_group: BUYER_GROUP_LINK,
      admin_wa: ADMIN_WA,
      buyer: { wa: wa || null, name: name || null },
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}
