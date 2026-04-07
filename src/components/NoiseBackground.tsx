"use client";

import { useEffect, useRef } from "react";

export function NoiseBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Trailing gold dot — lags slightly behind the native cursor
    const dot = document.getElementById("cursor-dot");
    if (!dot) return;

    let rx = -200, ry = -200;
    let mx = -200, my = -200;
    let raf: number;
    let initialized = false;

    const onMouseMove = (e: MouseEvent) => {
      mx = e.clientX;
      my = e.clientY;
      // Teleport on first move so dot doesn't slide in from off-screen
      if (!initialized) {
        rx = mx; ry = my;
        dot.style.left = rx + "px";
        dot.style.top = ry + "px";
        initialized = true;
      }

      // Card glow tracking
      const cards = document.querySelectorAll(".glass-card, .infra-card");
      cards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        (card as HTMLElement).style.setProperty("--mouse-x", x + "%");
        (card as HTMLElement).style.setProperty("--mouse-y", y + "%");
      });
    };

    const tick = () => {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      dot.style.left = rx + "px";
      dot.style.top = ry + "px";
      raf = requestAnimationFrame(tick);
    };

    const onMouseOver = (e: MouseEvent) => {
      const el = (e.target as Element).closest(
        'a, button, [role="button"], input, select, textarea'
      );
      if (el) {
        dot.classList.add("cursor-dot--hover");
      } else {
        dot.classList.remove("cursor-dot--hover");
      }
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseover", onMouseOver);
    raf = requestAnimationFrame(tick);

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseover", onMouseOver);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <>
      {/* Custom cursor elements */}
      <div id="cursor-dot" />
      <div id="cursor-ring" />
    </>
  );
}
