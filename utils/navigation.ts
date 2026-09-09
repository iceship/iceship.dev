// Fresh 2.3.3 uses this query parameter for client navigation.
// Keep this in sync with Fresh when upgrading the framework.
export const PARTIAL_PARAM = "fresh-partial";
export const PREFETCH_MAX_AGE = 30;

export function isPublicPage(pathname: string): boolean {
  return pathname === "/" || pathname === "/about" || pathname === "/blog" ||
    /^\/blog\/[^/]+$/.test(pathname);
}

export function partialPrefetchUrl(href: string, current: string): URL | null {
  const base = new URL(current);
  const url = new URL(href, base);
  if (
    url.origin !== base.origin || !/^https?:$/.test(url.protocol) ||
    url.username || url.password || !isPublicPage(url.pathname) ||
    (url.pathname === base.pathname && url.search === base.search)
  ) return null;
  url.hash = "";
  url.searchParams.set(PARTIAL_PARAM, "true");
  return url;
}

export function cachePartialResponse(
  request: Request,
  response: Response,
): void {
  const url = new URL(request.url);
  if (
    request.method === "GET" && isPublicPage(url.pathname) &&
    url.searchParams.get(PARTIAL_PARAM) === "true" &&
    response.status === 200 && !response.headers.has("Set-Cookie") &&
    response.headers.get("Content-Type")?.startsWith("text/html")
  ) {
    // The browser's HTTP cache is shared by our prefetch and Fresh's fetch().
    // Never share partial HTML through a CDN; full documents remain separate.
    response.headers.set(
      "Cache-Control",
      `private, max-age=${PREFETCH_MAX_AGE}`,
    );
  }
}
