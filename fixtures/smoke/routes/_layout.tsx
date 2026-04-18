// _layout.tsx - Root layout for smoke test
export default function RootLayout({ children }: { children: unknown }) {
  return (
    <html>
      <body>{children}</body>
    </html>
  );
}
