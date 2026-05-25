"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";

const STORAGE_KEY = "trimax-theme";

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle(
    "theme-light",
    theme === "light"
  );
}

export default function ThemeToggle() {
  const [theme, setTheme] =
    useState<Theme>(() => {
      if (typeof window === "undefined") {
        return "dark";
      }

      return window.localStorage.getItem(
        STORAGE_KEY
      ) === "light"
        ? "light"
        : "dark";
    });

  useEffect(() => {
    applyTheme(theme);
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  function handleToggle() {
    const nextTheme =
      theme === "dark" ? "light" : "dark";

    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(
      STORAGE_KEY,
      nextTheme
    );
  }

  return (
    <button
    type="button"
    onClick={handleToggle}
    className="rounded-2xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-orange-400 hover:text-orange-300"
    aria-label="Switch color theme"
  >
      <span suppressHydrationWarning>
        {theme === "light" ? "Dark" : "Light"}
      </span>
    </button>
  );
}
