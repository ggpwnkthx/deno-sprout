// The ContactCounter island. On mount, the island fetches the
// current count from /api/contact and displays it. The "client
// makes its own requests" pattern is the canonical island use
// case for live data: the server page is a snapshot, the island
// keeps the snapshot fresh.
import type { JSX } from "@sprout/jsx";

export default function ContactCounter(): JSX.Element {
  queueMicrotask(async () => {
    const target = document.querySelector<HTMLElement>('[data-testid="contact-count"]');
    if (target === null) return;

    try {
      const res = await fetch("/api/contact", {
        headers: { accept: "application/json" },
      });
      const data = await res.json() as { readonly count?: unknown };
      const count = typeof data.count === "number" ? data.count : 0;
      target.textContent = "Messages sent: " + count;
    } catch (_cause) {
      target.textContent = "Message count unavailable";
    }
  });

  return <p data-testid="contact-count">Loading current message count...</p>;
}
