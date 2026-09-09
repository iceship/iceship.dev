export default function SearchTrigger() {
  function handleClick() {
    globalThis.dispatchEvent(new CustomEvent("open-search-modal"));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="글 검색 (단축키 ⌘K)"
      title="검색 (⌘K)"
      class="inline-flex items-center gap-1.5 text-xs text-neutral-500 hover:text-indigo-600 dark:text-neutral-400 dark:hover:text-indigo-400 px-2 py-1 rounded border border-neutral-200 dark:border-neutral-800 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-colors select-none"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        class="w-3.5 h-3.5"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
          clipRule="evenodd"
        />
      </svg>
      <span class="hidden sm:inline">검색</span>
      <kbd class="hidden sm:inline font-sans text-[10px] text-neutral-400 dark:text-neutral-500">
        ⌘K
      </kbd>
    </button>
  );
}
