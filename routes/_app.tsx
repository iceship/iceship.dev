import { Partial } from "fresh/runtime";
import { define } from "../utils.ts";
import { Header } from "../components/Header.tsx";
import { Footer } from "../components/Footer.tsx";
import SearchModal from "../islands/SearchModal.tsx";
import BackToTop from "../islands/BackToTop.tsx";

export default define.page(function App({ Component }) {
  return (
    <html lang="ko">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>iceship.dev</title>
        <meta name="description" content="iceship의 미니멀 개인 블로그" />
        <meta name="color-scheme" content="light dark" />
        <link
          rel="icon"
          type="image/png"
          href="/favicon-96x96.png"
          sizes="96x96"
        />
        <link
          rel="icon"
          type="image/svg+xml"
          href="/favicon.svg"
        />
        <link
          rel="shortcut icon"
          href="/favicon.ico"
        />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon.png"
        />
        <meta name="apple-mobile-web-app-title" content="iceship" />
        <link rel="manifest" href="/site.webmanifest" />
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
        <script
          type="speculationrules"
          // deno-lint-ignore react-no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              prefetch: [
                {
                  source: "document",
                  where: {
                    and: [
                      { href_matches: "/*" },
                      { not: { href_matches: "/api/*" } },
                      { not: { href_matches: "/rss.xml" } },
                      { not: { href_matches: "/sitemap.xml" } },
                    ],
                  },
                  eagerness: "moderate",
                },
              ],
              prerender: [
                {
                  source: "document",
                  where: {
                    and: [
                      { href_matches: "/blog/*" },
                      { not: { href_matches: "/api/*" } },
                    ],
                  },
                  eagerness: "conservative",
                },
              ],
            }),
          }}
        />
      </head>
      <body
        f-client-nav
        f-view-transition
        class="bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100"
      >
        <a href="#main-content" class="skip-link">본문으로 건너뛰기</a>
        <Partial name="page">
          <Header />
          <Component />
          <Footer />
          <BackToTop />
          <SearchModal />
        </Partial>
      </body>
    </html>
  );
});
