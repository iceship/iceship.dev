export function Header() {
  return (
    <header class="max-w-[65ch] mx-auto px-5 pt-10 pb-6 flex items-baseline justify-between">
      <a href="/" class="text-lg font-bold tracking-tight hover:opacity-70">
        iceship.dev
      </a>
      <nav class="flex gap-5 text-sm text-neutral-600 dark:text-neutral-400">
        <a href="/blog" class="hover:text-black dark:hover:text-white">Blog</a>
        <a href="/about" class="hover:text-black dark:hover:text-white">
          About
        </a>
        <a href="/rss.xml" class="hover:text-black dark:hover:text-white">
          RSS
        </a>
      </nav>
    </header>
  );
}
