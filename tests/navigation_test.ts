import { equal } from "node:assert/strict";
import {
  cachePartialResponse,
  partialPrefetchUrl,
} from "../utils/navigation.ts";

Deno.test("prefetch uses Fresh's partial URL and preserves tag queries", () => {
  equal(
    partialPrefetchUrl("/blog?tag=C%2B%2B#top", "https://iceship.dev/")?.href,
    "https://iceship.dev/blog?tag=C%2B%2B&fresh-partial=true",
  );
  equal(
    partialPrefetchUrl("/blog/hello", "https://iceship.dev/blog")?.href,
    "https://iceship.dev/blog/hello?fresh-partial=true",
  );
});

Deno.test("prefetch excludes anchors, external URLs and non-page endpoints", () => {
  for (
    const href of [
      "#heading",
      "/blog/hello#heading",
      "https://example.com/blog/hello",
      "mailto:test@example.com",
      "javascript:void(0)",
      "/api/search",
      "/rss.xml",
      "/posts/hello",
      "/images/blog/example.webp",
    ]
  ) {
    equal(partialPrefetchUrl(href, "https://iceship.dev/blog/hello"), null);
  }
});

Deno.test("only successful public GET partial HTML gets a private browser cache", () => {
  const cases = [
    { path: "/blog/hello?fresh-partial=true", cache: true },
    { path: "/blog?tag=test&fresh-partial=true", cache: true },
    { path: "/about?fresh-partial=true", cache: true },
    { path: "/blog/hello", cache: false },
    { path: "/blog/hello?fresh-partial=false", cache: false },
    { path: "/api/search?fresh-partial=true", cache: false },
    { path: "/blog/missing?fresh-partial=true", status: 404, cache: false },
    { path: "/blog/hello?fresh-partial=true", method: "POST", cache: false },
    { path: "/blog/hello?fresh-partial=true", cookie: true, cache: false },
    { path: "/blog/hello?fresh-partial=true", json: true, cache: false },
  ];
  for (const item of cases) {
    const response = new Response("test", {
      status: item.status ?? 200,
      headers: {
        "Content-Type": item.json
          ? "application/json"
          : "text/html; charset=utf-8",
        ...(item.cookie ? { "Set-Cookie": "session=test" } : {}),
      },
    });
    cachePartialResponse(
      new Request(`https://iceship.dev${item.path}`, { method: item.method }),
      response,
    );
    equal(
      response.headers.get("Cache-Control"),
      item.cache ? "private, max-age=30" : null,
    );
  }
});
