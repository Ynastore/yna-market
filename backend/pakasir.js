const fetch = require("node-fetch");

const BASE = "https://app.pakasir.com/api";

async function transactionCreate({ method="qris", project, order_id, amount, api_key }){
  const url = `${BASE}/transactioncreate/${method}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ project, order_id, amount, api_key })
  });
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data?.message || `Pakasir create failed (${res.status})`);
  return data;
}

async function transactionDetail({ project, order_id, amount, api_key }){
  const url = `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(project)}&amount=${encodeURIComponent(amount)}&order_id=${encodeURIComponent(order_id)}&api_key=${encodeURIComponent(api_key)}`;
  const res = await fetch(url);
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data?.message || `Pakasir detail failed (${res.status})`);
  return data;
}

function payUrl({ slug, amount, order_id, redirect, qris_only=1 }){
  let url = `https://app.pakasir.com/pay/${encodeURIComponent(slug)}/${encodeURIComponent(amount)}?order_id=${encodeURIComponent(order_id)}`;
  if (qris_only) url += `&qris_only=1`;
  if (redirect) url += `&redirect=${encodeURIComponent(redirect)}`;
  return url;
}

module.exports = { transactionCreate, transactionDetail, payUrl };
