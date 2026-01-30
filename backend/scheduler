const { listOrders, setOrder } = require("./db");
const { api: pteroApi } = require("./ptero");

function startScheduler(env){
  const ptero = pteroApi(env.PTERO_DOMAIN, env.PTERO_APP_KEY);

  setInterval(async () => {
    try{
      const orders = listOrders();

      for (const o of orders){
        if (o.type !== "panel") continue;
        if (o.status !== "fulfilled") continue;
        if (!o.fulfilled?.ptero_server_id) continue;
        if (!o.fulfilled?.expires_at) continue;

        const exp = new Date(o.fulfilled.expires_at).getTime();
        if (Date.now() > exp && !o.fulfilled.suspended){
          await ptero.suspendServer(o.fulfilled.ptero_server_id);
          const fulfilled = { ...o.fulfilled, suspended:true, suspended_at: new Date().toISOString() };
          setOrder(o.order_id, { fulfilled });
        }
      }
    }catch(e){
      // biarin log aja
      console.error("[scheduler]", e.message);
    }
  }, 60_000); // cek tiap 1 menit
}

module.exports = { startScheduler };
