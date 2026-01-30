// backend/ptero.js
const fetch = require("node-fetch");

// === CONFIG (ambil dari env, jangan hardcode di frontend) ===
const PTERO_DOMAIN = process.env.PTERO_DOMAIN;      // https://server-vip.ynastore.my.id
const PTERO_APIKEY = process.env.PTERO_APIKEY;      // ptla_...
const PTERO_CAPKEY = process.env.PTERO_CAPKEY;      // ptlc_... (opsional)
const PTERO_EGG    = Number(process.env.PTERO_EGG); // 15
const PTERO_NESTID = Number(process.env.PTERO_NESTID); // 5
const PTERO_LOCID  = Number(process.env.PTERO_LOCID); // 1

function must(v, name){
  if(!v) throw new Error(`Missing env: ${name}`);
}
function headersApp(){
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": "Bearer " + PTERO_APIKEY
  };
}
function headersClient(){
  // client api key beda endpoint (/api/client) - tapi di code ini belum dipakai
  return {
    "Accept": "application/json",
    "Content-Type": "application/json",
    "Authorization": "Bearer " + PTERO_CAPKEY
  };
}

function normalizeUsername(username){
  return String(username || "").toLowerCase().trim();
}
function randomHex2(){
  return Math.floor(10 + Math.random() * 90); // 2 digit
}

async function getEggStartup(){
  const url = `${PTERO_DOMAIN}/api/application/nests/${PTERO_NESTID}/eggs/${PTERO_EGG}`;
  const r = await fetch(url, { method:"GET", headers: headersApp() });
  const j = await r.json();
  if(!r.ok) throw new Error(`Egg fetch failed: ${JSON.stringify(j)}`);
  return j?.attributes?.startup || "npm start";
}

async function findUserByUsername(username){
  const url = `${PTERO_DOMAIN}/api/application/users?filter[username]=${encodeURIComponent(username)}`;
  const r = await fetch(url, { method:"GET", headers: headersApp() });
  const j = await r.json();
  if(!r.ok) throw new Error(`User check failed: ${JSON.stringify(j)}`);
  const item = j?.data?.[0]?.attributes;
  return item || null;
}

async function createUser({ username }){
  const email = `${username}@gmail.com`;
  const name = `${username.charAt(0).toUpperCase()+username.slice(1)} Server`;
  const password = `${username}${randomHex2()}`; // sesuai request kamu: username + 2 angka

  const body = {
    email,
    username,
    first_name: name,
    last_name: "Server",
    language: "en",
    password
  };

  const r = await fetch(`${PTERO_DOMAIN}/api/application/users`, {
    method:"POST",
    headers: headersApp(),
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if(j?.errors) throw new Error(`Create user error: ${JSON.stringify(j.errors[0])}`);
  if(!r.ok) throw new Error(`Create user failed: ${JSON.stringify(j)}`);

  return { user: j.attributes, password };
}

// mapping plan web -> limits (sesuaikan dari request kamu)
function planToSpec(plan){
  // kamu minta: 5/8/10/unlimited
  // aku samain rasa dengan yang di bot kamu:
  const map = {
    "5":        { ram: 6000,  disk: 13000, cpu: 330 },
    "8":        { ram: 8000,  disk: 17000, cpu: 500 },
    "10":       { ram: 10000, disk: 20000, cpu: 600 }, // tambahan untuk web
    "unlimited":{ ram: 0,     disk: 25000, cpu: 0 }
  };
  return map[plan] || null;
}

async function createServer({ userId, username, plan }){
  const spec = planToSpec(plan);
  if(!spec) throw new Error("Plan RAM tidak valid.");

  const startup = await getEggStartup();
  const name = `${username} Server`;
  const desc = `Server dibuat pada ${new Date().toLocaleDateString("id-ID")}`;

  const body = {
    name,
    description: desc,
    user: userId,
    egg: PTERO_EGG,
    docker_image: "ghcr.io/parkervcp/yolks:nodejs_18",
    startup: startup,
    environment: {
      INST: "npm",
      USER_UPLOAD: "0",
      AUTO_UPDATE: "0",
      CMD_RUN: "npm start"
    },
    limits: {
      memory: spec.ram,
      swap: 0,
      disk: spec.disk,
      io: 500,
      cpu: spec.cpu
    },
    feature_limits: {
      databases: 5,
      backups: 5,
      allocations: 5
    },
    deploy: {
      locations: [PTERO_LOCID],
      dedicated_ip: false,
      port_range: []
    }
  };

  const r = await fetch(`${PTERO_DOMAIN}/api/application/servers`, {
    method:"POST",
    headers: headersApp(),
    body: JSON.stringify(body)
  });
  const j = await r.json();
  if(j?.errors) throw new Error(`Create server error: ${JSON.stringify(j.errors[0])}`);
  if(!r.ok) throw new Error(`Create server failed: ${JSON.stringify(j)}`);

  return j.attributes; // server
}

async function suspendServer(serverId){
  const r = await fetch(`${PTERO_DOMAIN}/api/application/servers/${serverId}/suspend`, {
    method:"POST",
    headers: headersApp()
  });
  if(!r.ok){
    const t = await r.text().catch(()=> "");
    throw new Error(`Suspend failed: ${serverId} ${t}`);
  }
}

async function unsuspendServer(serverId){
  const r = await fetch(`${PTERO_DOMAIN}/api/application/servers/${serverId}/unsuspend`, {
    method:"POST",
    headers: headersApp()
  });
  if(!r.ok){
    const t = await r.text().catch(()=> "");
    throw new Error(`Unsuspend failed: ${serverId} ${t}`);
  }
}

function assertConfig(){
  must(PTERO_DOMAIN, "PTERO_DOMAIN");
  must(PTERO_APIKEY, "PTERO_APIKEY");
  must(PTERO_EGG, "PTERO_EGG");
  must(PTERO_NESTID, "PTERO_NESTID");
  must(PTERO_LOCID, "PTERO_LOCID");
}

module.exports = {
  assertConfig,
  normalizeUsername,
  findUserByUsername,
  createUser,
  createServer,
  suspendServer,
  unsuspendServer,
  planToSpec,
  PTERO_DOMAIN
};
