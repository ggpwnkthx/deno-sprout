// API route used by the M3 server-rendering tests.
//
// The `GET` and `POST` exports return JSON payloads. `HEAD` and
// `PUT` are intentionally absent so the M3 tests can assert the
// 405 + `Allow` behavior. The file is `.ts` (not `.tsx`) so the
// JSX transformer is not required: the default export is plain.
import type { RouteHandler } from "@sprout/core";

export const GET: RouteHandler = (c) => {
  return c.json({ items: [] });
};

export const POST: RouteHandler = (c) => {
  return c.json({ ok: true, method: "POST" });
};

export default function Contact(): string {
  return "contact";
}
