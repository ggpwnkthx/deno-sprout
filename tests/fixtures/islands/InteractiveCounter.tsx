/// <reference lib="dom" />
import { useEffect, useSignal } from "@ggpwnkthx/sprout-islands";

export default function InteractiveCounter() {
  const count = useSignal(0);

  const handleClick = () => {
    count.value++;
  };

  // Attach click listener to the button after innerHTML is set.
  // The signal dependency ensures this effect re-runs when count changes.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const btn = document.querySelector(
      "[data-island='InteractiveCounter'] button",
    ) as HTMLButtonElement | null;
    if (!btn) return;
    btn.addEventListener("click", handleClick);
    // Also imperatively update span text when count changes
    const span = btn.querySelector(".count");
    if (span) span.textContent = String(count.value);
  });

  return (
    <button type="button" onClick={handleClick}>
      Count: <span class="count">{count.value}</span>
    </button>
  );
}
