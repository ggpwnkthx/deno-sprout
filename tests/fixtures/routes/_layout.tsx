import type { LayoutComponent } from "@ggpwnkthx/sprout";

const Layout: LayoutComponent = ({ children }) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>My Sprout App</title>
      <link rel="stylesheet" href="/static/styles.css" />
    </head>
    <body>
      {children}
      <script type="module" src="/_sprout/hydrate.js"></script>
    </body>
  </html>
);

export default Layout;
