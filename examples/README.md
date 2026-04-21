# Sprout Examples

| Example                             | What it demonstrates                                              |
| ----------------------------------- | ----------------------------------------------------------------- |
| [minimal](./minimal/)               | `createApp()`, `PageComponent`, `LayoutComponent` — the core loop |
| [blog](./blog/)                     | `handler` export (data loader) + typed `PageComponent<TData>`     |
| [api](./api/)                       | `GET`/`POST`/`PUT`/`DELETE` exports — pure REST API routes        |
| [islands](./islands/)               | Island component serialization and client-side hydration          |
| [error-handling](./error-handling/) | `_404.tsx` and `_error.tsx` conventions                           |

Run any example:

```bash
cd examples/<name>
deno task dev
```
