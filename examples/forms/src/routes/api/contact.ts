// The /api/contact endpoint. A method-only route: a `GET` that
// returns the current message count as JSON, and a `POST` that
// accepts a JSON body, increments the count, and either:
//   - returns JSON, when the request was a `fetch` call with
//     `Accept: application/json`; or
//   - redirects to `/?ok=1`, when the request was a normal form
//     POST (the default).
//
// The "redirect-after-POST" pattern is the right behavior for
// form submissions because it survives a page refresh: a browser
// that refreshes after a redirect does not re-submit the form.
import type { RequestContext } from "@sprout/core";

// A tiny in-memory count. In a real app this would be a database
// write; for the M9 example, the state lives in module scope.
let messageCount = 0;

export function GET(_c: RequestContext): Response {
  return jsonResponse({ count: messageCount });
}

export async function POST(c: RequestContext): Promise<Response> {
  let payload: { name?: string; message?: string } = {};
  try {
    payload = await c.request.json();
  } catch (_cause) {
    // A request without a JSON body is treated as a form POST.
    // The M9 release does not parse `application/x-www-form-urlencoded`
    // bodies in user code; the example expects a JSON body.
  }
  if (typeof payload.name === "string" && typeof payload.message === "string") {
    messageCount += 1;
  }
  const accept = c.request.headers.get("accept") ?? "";
  if (accept.includes("application/json")) {
    return jsonResponse({ ok: true, count: messageCount });
  }
  return new Response(null, {
    status: 303,
    headers: { location: "/?ok=1" },
  });
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
