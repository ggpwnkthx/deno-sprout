// The ThemeToggle island. A button that toggles a `data-theme`
// attribute on the document's `<html>` element. The chosen
// theme is persisted to `localStorage` so a page reload restores
// the user's choice.
import type { JSX } from "@sprout/jsx";

export default function ThemeToggle(): JSX.Element {
  return (
    <button type="button" data-testid="theme-toggle">
      Toggle theme
    </button>
  );
}
