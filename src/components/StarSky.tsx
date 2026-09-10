// ===== آسمانِ واقعی — پس‌زمینه‌ی حالت تمرکز عمیق =====
// ستاره‌های واقعی (کاتالوگ داخلی) بر اساس موقعیت جغرافیایی و همین لحظه رندر می‌شوند.
// بدون عکس، بدون اینترنت — فقط ریاضی نجومی روی Canvas.

import { useEffect, useRef, useState } from "react";
import { DEFAULT_LOCATION, moonPhase, visibleStars, type VisibleStar } from "../lib/stars";

function useReducedMotion(): boolean {
  const [reduced] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );
  return reduced;
}

/** موقعیت زمینی: پیش‌فرض تهران؛ اگر مجوز موقعیت از قبل داده شده باشد، بی‌صدا از همان استفاده می‌شود */
function useLocation(): { lat: number; lon: number } {
  const [loc, setLoc] = useState({ lat: DEFAULT_LOCATION.lat, lon: DEFAULT_LOCATION.lon });
  useEffect(() => {
    let cancelled = false;
    const useGeo = (lat: number, lon: number) => {
      if (!cancelled) setLoc({ lat, lon });
    };
    try {
      const perms = (navigator as Navigator & { permissions?: Permissions }).permissions;
      if (!perms?.query || !navigator.geolocation) return;
      void perms.query({ name: "geolocation" }).then((st) => {
        if (cancelled || st.state !== "granted") return;
        navigator.geolocation.getCurrentPosition(
          (p) => useGeo(p.coords.latitude, p.coords.longitude),
          () => undefined,
          { maximumAge: 3600e3, timeout: 4000 },
        );
      });
    } catch {
      /* اختیاری */
    }
    return () => {
      cancelled = true;
    };
  }, []);
  return loc;
}

export default function StarSky({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { lat, lon } = useLocation();
  const reduced = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let stars: VisibleStar[] = [];
    let starsAt = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const { clientWidth: w, clientHeight: h } = canvas;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    ro?.observe(canvas);

    const refreshStars = (t: number) => {
      if (t - starsAt > 30e3 || starsAt === 0) {
        // هر ۳۰ ثانیه موقعیت‌ها را به‌روز کن (چرخش آسمان)
        stars = visibleStars(t, lat, lon);
        starsAt = t;
      }
    };

    const draw = (t: number) => {
      refreshStars(t);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h * 0.56;
      const R = Math.min(w, h) * 0.52;

      // هاله‌ی افق
      const grad = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.25);
      grad.addColorStop(0, "rgba(20,184,166,0.045)");
      grad.addColorStop(0.75, "rgba(15,23,42,0)");
      grad.addColorStop(1, "rgba(15,23,42,0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // دایره‌ی افق
      ctx.strokeStyle = "rgba(148,163,184,0.14)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      // برچسب جهات (شمال بالای گنبد)
      const dirs: { label: string; az: number }[] = [
        { label: "ش", az: 0 },
        { label: "ق", az: Math.PI / 2 },
        { label: "ج", az: Math.PI },
        { label: "غ", az: (3 * Math.PI) / 2 },
      ];
      ctx.font = "10px Tahoma, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (const d of dirs) {
        const x = cx + Math.sin(d.az) * (R + 14);
        const y = cy - Math.cos(d.az) * (R + 14);
        ctx.fillStyle = "rgba(148,163,184,0.4)";
        ctx.fillText(d.label, x, y);
      }

      // ستاره‌ها با سوسوزدنِ نرم
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const rr = ((90 - s.alt) / 90) * R;
        const azr = (s.az * Math.PI) / 180;
        const x = cx + Math.sin(azr) * rr;
        const y = cy - Math.cos(azr) * rr;
        const tw = reduced ? 0.85 : 0.55 + 0.45 * Math.sin(t / 900 + i * 2.13);
        const alpha = Math.max(0.12, Math.min(0.95, tw * (0.55 + (2.6 - s.mag) / 5)));
        ctx.fillStyle = `rgba(226,232,240,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, s.size, 0, Math.PI * 2);
        ctx.fill();
        // درخششِ ضربدری کوچک برای ستاره‌های خیلی درخشان
        if (s.mag <= 0) {
          ctx.strokeStyle = `rgba(226,232,240,${(alpha * 0.35).toFixed(3)})`;
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(x - s.size * 3, y);
          ctx.lineTo(x + s.size * 3, y);
          ctx.moveTo(x, y - s.size * 3);
          ctx.lineTo(x, y + s.size * 3);
          ctx.stroke();
        }
      }

      // ماه (فاز واقعی) گوشه‌ی آسمان
      const moon = moonPhase(t);
      ctx.font = "30px serif";
      ctx.textAlign = "center";
      ctx.globalAlpha = 0.9;
      ctx.fillText(moon.emoji, w - 62, 68);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(148,163,184,0.5)";
      ctx.font = "11px Tahoma, sans-serif";
      ctx.fillText(moon.name, w - 62, 96);

      if (!reduced) raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [lat, lon, reduced]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
