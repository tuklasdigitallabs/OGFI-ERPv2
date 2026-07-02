"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

function applyTheme(theme: ThemeMode) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeModeSelect() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const storedTheme = window.localStorage.getItem("ogfi_theme");
    const nextTheme = storedTheme === "dark" ? "dark" : "light";
    setTheme(nextTheme);
    applyTheme(nextTheme);
  }, []);

  function selectTheme(nextTheme: ThemeMode) {
    setTheme(nextTheme);
    window.localStorage.setItem("ogfi_theme", nextTheme);
    applyTheme(nextTheme);
  }

  return (
    <div
      aria-label="Theme mode"
      className="theme-mode-select inline-flex h-10 items-center rounded-[var(--radius-control)] border border-slate-200 bg-white p-1 shadow-sm"
      role="group"
    >
      <button
        aria-pressed={theme === "light"}
        className={theme === "light" ? "theme-mode-option is-active" : "theme-mode-option"}
        onClick={() => selectTheme("light")}
        title="Use light mode"
        type="button"
      >
        <Sun aria-hidden="true" className="h-4 w-4" />
        <span className="hidden sm:inline">Light</span>
      </button>
      <button
        aria-pressed={theme === "dark"}
        className={theme === "dark" ? "theme-mode-option is-active" : "theme-mode-option"}
        onClick={() => selectTheme("dark")}
        title="Use dark mode"
        type="button"
      >
        <Moon aria-hidden="true" className="h-4 w-4" />
        <span className="hidden sm:inline">Dark</span>
      </button>
    </div>
  );
}
