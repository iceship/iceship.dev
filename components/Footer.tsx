export function Footer() {
  return (
    <footer class="site-shell site-footer">
      <span>© 2026 iceship</span>
      <nav aria-label="외부 링크 및 구독">
        <a
          href="https://github.com/iceship"
          target="_blank"
          rel="noopener noreferrer"
        >
          GitHub
        </a>
        <a href="/rss.xml" f-client-nav={false}>RSS</a>
      </nav>
    </footer>
  );
}
