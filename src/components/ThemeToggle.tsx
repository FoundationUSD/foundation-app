"use client";

import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("darkMode");
    if (stored === "true") {
      document.documentElement.classList.remove("light");
      setDark(true);
    } else {
      document.documentElement.classList.add("light");
      setDark(false);
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.remove("light");
      localStorage.setItem("darkMode", "true");
    } else {
      document.documentElement.classList.add("light");
      localStorage.setItem("darkMode", "false");
    }
  };

  return (
    <button
      onClick={toggle}
      className="theme-toggle-btn"
      title={dark ? "Switch to light" : "Switch to dark"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {dark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}
