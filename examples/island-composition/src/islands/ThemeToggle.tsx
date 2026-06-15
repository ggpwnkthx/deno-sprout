// The ThemeToggle island. A button that toggles a `data-theme`
// attribute on the document's `<html>` element. The chosen
// theme is persisted to `localStorage` so a page reload restores
// the user's choice.
import type { JSX } from "@sprout/jsx";

export default function ThemeToggle(): JSX.Element {
  queueMicrotask(() => {
    const button = document.querySelector<HTMLButtonElement>('[data-testid="theme-toggle"]');
    if (button === null) return;

    const applyTheme = (theme: "light" | "dark"): void => {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("sprout-theme", theme);
      button.textContent = theme === "dark" ? "Use light theme" : "Use dark theme";
    };

    const saved = localStorage.getItem("sprout-theme") === "dark" ? "dark" : "light";
    applyTheme(saved);
    button.addEventListener("click", () => {
      applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });
  });

  return (
    <button type="button" data-testid="theme-toggle">
      Toggle theme
    </button>
  );
}
