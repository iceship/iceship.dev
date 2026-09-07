export function Header() {
  return (
    <header class="max-w-[65ch] mx-auto px-5 pt-10 pb-6 flex items-baseline justify-between">
      <a href="/" class="text-lg font-bold tracking-tight hover:opacity-70">
        iceship.dev
      </a>
      <nav class="flex gap-5 text-sm text-neutral-500 dark:text-neutral-400">
        <a
          href="/blog"
          class="hover:text-black dark:hover:text-white data-[current]:text-black dark:data-[current]:text-white data-[current]:font-semibold"
        >
          Blog
        </a>
        <a
          href="/about"
          class="hover:text-black dark:hover:text-white data-[current]:text-black dark:data-[current]:text-white data-[current]:font-semibold"
        >
          About
        </a>
        <a
          href="/rss.xml"
          f-client-nav={false}
          class="hover:text-black dark:hover:text-white data-[current]:text-black dark:data-[current]:text-white data-[current]:font-semibold"
        >
          RSS
        </a>
      </nav>
    </header>
  );
}
