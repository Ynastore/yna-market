/* assets/app.js
   YNA STORE — Core JS
   - Loader
   - Mobile nav
   - Click sound
   - Snow background
   - Small utilities (year, smooth anchors)
*/

(function () {
  // ===== Year =====
  const y = document.getElementById("year");
  if (y) y.textContent = new Date().getFullYear();

  // ===== Loader =====
  const loader = document.getElementById("loader");
  if (loader) {
    // show minimal time for aesthetic
    window.addEventListener("load", () => {
      setTimeout(() => loader.classList.add("hide"), 550);
    });
  }

  // ===== Mobile Nav =====
  const nav = document.getElementById("nav");
  const burger = document.getElementById("hamburger");

  if (nav && burger) {
    const toggle = () => nav.classList.toggle("open");
    burger.addEventListener("click", (e) => {
      e.preventDefault();
      playClick();
      toggle();
    });

    // close when clicking a link (mobile)
    nav.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (!a) return;
      if (nav.classList.contains("open")) nav.classList.remove("open");
    });

    // close when clicking outside
    document.addEventListener("click", (e) => {
      if (!nav.classList.contains("open")) return;
      const inside = nav.contains(e.target) || burger.contains(e.target);
      if (!inside) nav.classList.remove("open");
    });

    // close on escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") nav.classList.remove("open");
    });
  }

  // ===== Click Sound (optional) =====
  const clickAudio = document.getElementById("clickSound");
  function playClick() {
    if (!clickAudio) return;
    try {
      clickAudio.currentTime = 0;
      clickAudio.volume = 0.35;
      clickAudio.play().catch(() => {});
    } catch {}
  }

  // Play sound on all .btn / .chip / hamburger
  document.addEventListener("click", (e) => {
    const el = e.target.closest(".btn, .chip, #hamburger, .nav a");
    if (!el) return;
    playClick();
  });

  // ===== Smooth scroll for internal anchors =====
  document.addEventListener("click", (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute("href");
    if (!id || id === "#") return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  // ===== Snow Effect =====
  const canvas = document.getElementById("snow");
  if (canvas) {
    const ctx = canvas.getContext("2d");
    let w = 0, h = 0;
    let particles = [];
    let raf = null;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      const count = Math.min(140, Math.floor((w * h) / 22000)); // adaptive
      particles = new Array(count).fill(0).map(makeParticle);
    }

    function makeParticle() {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.6 + Math.random() * 2.4,
        vx: (-0.25 + Math.random() * 0.5),
        vy: 0.6 + Math.random() * 1.6,
        o: 0.25 + Math.random() * 0.55,
      };
    }

    function step() {
      ctx.clearRect(0, 0, w, h);
      ctx.beginPath();
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;

        // subtle sway
        p.x += Math.sin((p.y / 60)) * 0.15;

        if (p.y > h + 6) {
          p.y = -10;
          p.x = Math.random() * w;
        }
        if (p.x < -10) p.x = w + 10;
        if (p.x > w + 10) p.x = -10;

        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      }
      ctx.fillStyle = "rgba(255,255,255,0.65)";
      ctx.fill();

      // glow overlay
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = "rgba(122,124,255,0.06)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(step);
    }

    resize();
    step();

    window.addEventListener("resize", () => {
      resize();
    });

    // pause when tab hidden
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
      } else if (!raf) {
        step();
      }
    });
  }

  // expose for inline pages if needed
  window.__YNA = { playClick };
})();
