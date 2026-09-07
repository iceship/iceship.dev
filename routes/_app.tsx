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
      <body class="bg-white text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
        <Header />
        <Component />
        <Footer />
      </body>
    </html>
  );
});
