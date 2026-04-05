"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [light, setLight] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme");
    if (stored === "light") {
      document.documentElement.classList.add("light");
      setLight(true);
    }
  }, []);

  const toggle = () => {
    const next = !light;
    setLight(next);
    document.documentElement.classList.toggle("light", next);
    localStorage.setItem("theme", next ? "light" : "dark");
  };

  return (
    <button
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center border border-[var(--border-color)] text-[var(--muted)] transition-colors hover:border-[var(--border-hover)] hover:text-[var(--fg)]"
      title={light ? "Switch to dark" : "Switch to light"}
    >
      {light ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
    </button>
  );
}
