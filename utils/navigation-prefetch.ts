import { partialPrefetchUrl, PREFETCH_MAX_AGE } from "./navigation.ts";

export function installNavigationPrefetch(): () => void {
  const recent = new Map<string, number>();
  const listeners = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: HTMLAnchorElement | null = null;
  let active = 0;

  function linkFor(target: EventTarget | null): HTMLAnchorElement | null {
    return target instanceof Element ? target.closest("a[href]") : null;
  }

  async function prefetch(link: HTMLAnchorElement) {
    const connection = (navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }).connection;
    if (
      !navigator.onLine || connection?.saveData ||
      /(^|-)2g$/.test(connection?.effectiveType ?? "") ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("f-partial") ||
      link.closest("[f-client-nav]")?.getAttribute("f-client-nav") === "false"
    ) return;

    const url = partialPrefetchUrl(link.href, location.href);
    if (!url || active >= 2) return;
    const key = url.href;
    const now = Date.now();
    for (const [href, expires] of recent) {
      if (expires <= now) recent.delete(href);
    }
    if (recent.has(key)) return;
    if (recent.size >= 20) recent.delete(recent.keys().next().value!);
    recent.set(key, now + PREFETCH_MAX_AGE * 1000);
    active++;
    try {
      // Match Fresh's URL and default fetch options so navigation uses the
      // same HTTP cache entry. Do not add request headers or use no-store.
      const response = await fetch(url, { redirect: "follow" });
      await response.arrayBuffer();
      if (!response.ok || response.redirected) recent.delete(key);
    } catch {
      // Speculation must never interfere with normal navigation; allow retry.
      recent.delete(key);
    } finally {
      active--;
    }
  }

  function cancelHover() {
    clearTimeout(timer);
    pending = null;
  }

  document.addEventListener("pointerover", (event) => {
    if (event.pointerType !== "mouse") return;
    const link = linkFor(event.target);
    if (!link || link === pending) return;
    cancelHover();
    pending = link;
    timer = setTimeout(() => void prefetch(link), 65);
  }, { signal: listeners.signal });

  document.addEventListener("pointerout", (event) => {
    if (pending && !pending.contains(event.relatedTarget as Node | null)) {
      cancelHover();
    }
  }, { signal: listeners.signal });

  document.addEventListener("focusin", (event) => {
    const link = linkFor(event.target);
    if (link) void prefetch(link);
  }, { signal: listeners.signal });

  return () => {
    cancelHover();
    listeners.abort();
  };
}
