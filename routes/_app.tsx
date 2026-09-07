import { define } from "../utils.ts";
import { Header } from "../components/Header.tsx";
import { Footer } from "../components/Footer.tsx";

export default define.page(function App({ Component }) {
  return (
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>iceship.dev</title>
        <meta name="description" content="iceship의 미니멀 개인 블로그" />
        <meta name="color-scheme" content="light dark" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/logo.svg" type="image/svg+xml" />
        <link
          rel="alternate"
          type="application/rss+xml"
          title="iceship.dev RSS Feed"
          href="/rss.xml"
        />
        <meta property="og:site_name" content="iceship.dev" />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://iceship.dev/og-image.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://iceship.dev/og-image.png" />
        <meta
          name="theme-color"
          content="#ffffff"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#0a0a0a"
          media="(prefers-color-scheme: dark)"
        />
      </head>
      <body
        f-client-nav
        f-view-transition
        class="bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100"
      >
        <Header />
        <Component />
        <Footer />
      </body>
    </html>
  );
});
