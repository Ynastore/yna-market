function rnd(min, max){ return Math.floor(Math.random() * (max - min + 1)) + min; }

function makeOrderId(prefix="INV"){
  const d = new Date();
  const y = d.getFullYear().toString().slice(2);
  const m = (d.getMonth()+1).toString().padStart(2,"0");
  const day = d.getDate().toString().padStart(2,"0");
  return `${prefix}${y}${m}${day}-${Date.now().toString().slice(-6)}${rnd(10,99)}`;
}

function sanitizeUsername(s){
  return String(s||"")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g,"")
    .slice(0, 20);
}

function sanitizeWA(s){
  return String(s||"").replace(/\D/g,"").replace(/^0/,"62");
}

function moneyInt(s){
  // "35 k" -> 35000
  const n = String(s||"").toLowerCase().replace(/\s/g,"");
  if (n.endsWith("k")) return parseInt(n.replace("k",""),10) * 1000;
  return parseInt(n.replace(/\D/g,""),10);
}

module.exports = { rnd, makeOrderId, sanitizeUsername, sanitizeWA, moneyInt };
