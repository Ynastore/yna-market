const fs = require("fs");
const path = require("path");

const DB_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DB_DIR, "orders.json");

function ensure(){
  if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify({ orders: {} }, null, 2));
}

function read(){
  ensure();
  try { return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); }
  catch { return { orders: {} }; }
}

function write(db){
  ensure();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function getOrder(order_id){
  const db = read();
  return db.orders[order_id] || null;
}

function setOrder(order_id, patch){
  const db = read();
  db.orders[order_id] = { ...(db.orders[order_id]||{}), ...patch };
  write(db);
  return db.orders[order_id];
}

function listOrders(){
  const db = read();
  return Object.values(db.orders || {});
}

module.exports = { getOrder, setOrder, listOrders };
