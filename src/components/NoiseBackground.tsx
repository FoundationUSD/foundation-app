"use client";

import { useEffect, useRef } from "react";

export function NoiseBackground() {
  const holeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = holeRef.current;
    if (!el) return;

    let currentX = -200;
    let currentY = -200;
    let targetX = -200;
    let targetY = -200;
    let raf: number;

    const handleMouse = (e: MouseEvent) => {
      targetX = e.clientX;
      targetY = e.clientY;
    };

    const handleLeave = () => {
      targetX = -200;
      targetY = -200;
    };

    const tick = () => {
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;
      el.style.setProperty("--mx", `${currentX}px`);
      el.style.setProperty("--my", `${currentY}px`);
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", handleMouse);
    document.addEventListener("mouseleave", handleLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", handleMouse);
      document.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-1">
      {/* Soft gradient blobs */}
      <div
        className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] animate-[drift_25s_ease-in-out_infinite]"
        style={{
          background: "radial-gradient(circle, var(--blob-color) 0%, transparent 70%)",
          borderRadius: "50%",
        }}
      />
      <div
        className="absolute right-[-5%] bottom-[10%] h-[500px] w-[500px] animate-[drift_30s_ease-in-out_infinite_reverse]"
        style={{
          background: "radial-gradient(circle, var(--blob-color) 0%, transparent 70%)",
          borderRadius: "50%",
        }}
      />
      <div
        className="absolute top-[40%] left-[50%] h-[400px] w-[400px] animate-[drift_35s_ease-in-out_infinite_2s]"
        style={{
          background: "radial-gradient(circle, var(--blob-color) 0%, transparent 70%)",
          borderRadius: "50%",
        }}
      />

      {/* Cursor hole — masks the halftone dots around the cursor */}
      <div
        ref={holeRef}
        className="cursor-hole"
      />
    </div>
  );
}
