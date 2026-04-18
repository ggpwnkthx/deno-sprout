// routes/_layout.tsx
// Layout that includes the hydrate script for islands
export default function Layout({ children }: { children: unknown }) {
  return (
    <html>
      <head>
        <title>Islands Smoke Test</title>
        <script type="module" src="/_sprout/runtime/hydrate.js" />
      </head>
      <body>{children}</body>
    </html>
  );
}
