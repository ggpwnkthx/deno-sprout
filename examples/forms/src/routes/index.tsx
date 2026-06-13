// The home route. A contact form whose `action` points at the
// `/api/contact` endpoint. The form uses the standard HTTP POST
// flow: the user submits, the endpoint processes the JSON body,
// and the endpoint either redirects (when the request is a normal
// form POST) or returns JSON (when the request was a fetch call
// with `Accept: application/json`).
import type { JSX } from "@sprout/jsx";
import ContactCounter from "../islands/ContactCounter.tsx";

export default function Home(props: { url: URL }): JSX.Element {
  const justSubmitted = props.url.searchParams.get("ok") === "1";
  return (
    <main>
      <h1>Contact us</h1>
      {justSubmitted ? <p>Thanks — your message was received.</p> : null}
      <form method="POST" action="/api/contact">
        <label>
          Name
          <input type="text" name="name" required />
        </label>
        <label>
          Message
          <textarea name="message" required />
        </label>
        <button type="submit">Send</button>
      </form>
      <ContactCounter />
    </main>
  );
}
