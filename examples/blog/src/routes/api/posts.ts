// The JSON API endpoint. A pure API route: no page default, just a
// GET method handler that returns the post list as JSON. The same
// data is rendered on the home page; the JSON form is for the
// client-side island that polls this endpoint in the
// `examples/forms/` example, and for curl users.
import type { RequestContext } from "@sprout/core";
import { POSTS } from "../../data.ts";

export function GET(_c: RequestContext): Response {
  return new Response(JSON.stringify({ posts: POSTS }), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
