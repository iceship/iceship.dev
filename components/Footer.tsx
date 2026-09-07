export function Footer() {
  return (
    <footer class="max-w-[65ch] mx-auto px-5 mt-16">
      <div class="border-t border-neutral-200 dark:border-neutral-800 py-10 text-sm text-neutral-500 dark:text-neutral-400 flex justify-between">
        <span>© 2026 iceship</span>
        <span>
          Built with{" "}
          <a
            href="https://fresh.deno.dev"
            target="_blank"
            rel="noopener noreferrer"
            class="underline"
          >
            Fresh
          </a>
        </span>
      </div>
    </footer>
  );
}
