/* assets/promo.js
   YNA STORE — Promo Countdown
   - Countdown (hari/jam/menit/detik)
   - Bisa set promo target via:
     1) window.PROMO_TARGET = "2026-01-24T23:59:59+07:00"
     2) atau data-target di element: <div id="promoCountdown" data-target="...">
   - Auto update setiap 250ms
*/

(function () {
  // Elemen wajib di promo.html:
  // <div id="promoCountdown" class="countdown" data-target="2026-01-24T23:59:59+07:00">
  //   <div class="cd"><span id="d">00</span><small>Hari</small></div>
  //   <div class="cd"><span id="h">00</span><small>Jam</small></div>
  //   <div class="cd"><span id="m">00</span><small>Menit</small></div>
  //   <div class="cd"><span id="s">00</span><small>Detik</small></div>
  // </div>

  const root = document.getElementById("promoCountdown");
  if (!root) return;

  const elD = document.getElementById("d");
  const elH = document.getElementById("h");
  const elM = document.getElementById("m");
  const elS = document.getElementById("s");
  const label = document.getElementById("promoStatus");

  const targetStr =
    (window.PROMO_TARGET && String(window.PROMO_TARGET)) ||
    root.getAttribute("data-target") ||
    "2026-01-24T23:59:59+07:00"; // default

  let target = new Date(targetStr);

  // Fallback jika parse gagal:
  if (isNaN(target.getTime())) {
    // coba format "YYYY-MM-DD HH:mm:ss"
    const safe = targetStr.replace(" ", "T");
    target = new Date(safe);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function tick() {
    const now = new Date();
    let diff = target.getTime() - now.getTime();

    if (diff <= 0) {
      if (elD) elD.textContent = "00";
      if (elH) elH.textContent = "00";
      if (elM) elM.textContent = "00";
      if (elS) elS.textContent = "00";
      root.classList.add("countdown--done");
      if (label) label.textContent = "Promo sudah berakhir.";
      return;
    }

    const sec = Math.floor(diff / 1000);
    const days = Math.floor(sec / 86400);
    const hours = Math.floor((sec % 86400) / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;

    if (elD) elD.textContent = pad(days);
    if (elH) elH.textContent = pad(hours);
    if (elM) elM.textContent = pad(mins);
    if (elS) elS.textContent = pad(secs);

    if (label) {
      label.textContent = `Promo aktif • Berakhir: ${formatID(target)}`;
    }
  }

  function formatID(d) {
    // format sederhana WIB-like (tanpa library)
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `${dd}-${mm}-${yyyy} ${hh}:${mi}:${ss}`;
  }

  tick();
  setInterval(tick, 250);
})();
