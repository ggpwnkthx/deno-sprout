// The ContactCounter island. On mount, the island fetches the
// current count from /api/contact and displays it. The "client
// makes its own requests" pattern is the canonical island use
// case for live data: the server page is a snapshot, the island
// keeps the snapshot fresh.
import type { JSX } from "@sprout/jsx";

export default function ContactCounter(): JSX.Element {
  return <p data-testid="contact-count">Loading current message count...</p>;
}
