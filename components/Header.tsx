import SearchTrigger from "../islands/SearchTrigger.tsx";

export function Header() {
  return (
    <header class="site-shell site-header">
      <a href="/" class="site-name">iceship.dev</a>
      <div class="flex items-center gap-3 sm:gap-4">
        <SearchTrigger />
        <nav class="site-nav" aria-label="주 메뉴">
          <a href="/blog">글</a>
          <a href="/about">소개</a>
        </nav>
      </div>
    </header>
  );
}
