import { useEffect, useRef, useState } from "preact/hooks";

interface SearchPost {
  slug: string;
  title: string;
  summary: string;
  tags: string[];
  date: string;
}

export default function SearchModal() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  // 검색 데이터 로드
  async function loadPosts() {
    if (posts.length > 0 || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/search");
      if (res.ok) {
        const data = await res.json();
        setPosts(data);
      }
    } catch {
      // 오류 시 빈 목록 유지
    } finally {
      setLoading(false);
    }
  }

  function openModal() {
    dialogRef.current?.showModal();
    loadPosts();
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }

  function closeModal() {
    dialogRef.current?.close();
    setQuery("");
    setActiveIndex(0);
  }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K 또는 Ctrl+K로 검색 모달 토글
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialogRef.current?.open) {
          closeModal();
        } else {
          openModal();
        }
        return;
      }

      // '/' 키 입력 시 검색 (입력 요소 내부가 아닐 때만)
      if (
        e.key === "/" &&
        !dialogRef.current?.open &&
        !(e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement ||
          (e.target as HTMLElement)?.isContentEditable)
      ) {
        e.preventDefault();
        openModal();
        return;
      }
    }

    function handleCustomOpen() {
      openModal();
    }

    globalThis.addEventListener("keydown", handleKeyDown);
    globalThis.addEventListener("open-search-modal", handleCustomOpen);

    return () => {
      globalThis.removeEventListener("keydown", handleKeyDown);
      globalThis.removeEventListener("open-search-modal", handleCustomOpen);
    };
  }, [posts.length, loading]);

  const trimmed = query.trim().toLowerCase();
  const filtered = trimmed === "" ? posts.slice(0, 6) : posts.filter((post) => {
    const inTitle = post.title.toLowerCase().includes(trimmed);
    const inSummary = post.summary.toLowerCase().includes(trimmed);
    const inTags = post.tags.some((t) => t.toLowerCase().includes(trimmed));
    return inTitle || inSummary || inTags;
  });

  function handleInputKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) =>
        prev <= 0 ? Math.max(0, filtered.length - 1) : prev - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      const targetPost = filtered[activeIndex];
      if (targetPost) {
        closeModal();
        globalThis.location.href = `/blog/${targetPost.slug}`;
      }
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        // 배경(Backdrop) 클릭 시 닫기
        if (e.target === dialogRef.current) {
          closeModal();
        }
      }}
      class="search-dialog fixed inset-0 m-auto w-[92vw] max-w-lg rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 shadow-2xl p-0 backdrop:bg-black/40 backdrop:backdrop-blur-sm z-50 overflow-hidden"
    >
      <div class="p-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          class="w-5 h-5 text-indigo-500 dark:text-indigo-400 shrink-0"
        >
          <path
            fillRule="evenodd"
            d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
            clipRule="evenodd"
          />
        </svg>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onInput={(e) => {
            setQuery((e.target as HTMLInputElement).value);
            setActiveIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          placeholder="글 제목, 내용, 태그 검색... (Esc로 닫기)"
          class="w-full bg-transparent text-sm sm:text-base outline-none text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500"
        />
        <button
          type="button"
          onClick={closeModal}
          aria-label="닫기"
          class="text-xs px-1.5 py-0.5 rounded border border-neutral-300 dark:border-neutral-700 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
        >
          Esc
        </button>
      </div>

      <div class="max-h-[60vh] overflow-y-auto p-2">
        {loading && posts.length === 0 && (
          <p class="py-6 text-center text-xs text-neutral-400">
            글 목록 불러오는 중...
          </p>
        )}

        {!loading && filtered.length === 0 && (
          <p class="py-8 text-center text-xs text-neutral-400">
            검색 결과가 없습니다.
          </p>
        )}

        {filtered.map((post, idx) => (
          <a
            key={post.slug}
            href={`/blog/${post.slug}`}
            onClick={closeModal}
            class={`block p-3 rounded-lg text-left transition-all ${
              idx === activeIndex
                ? "bg-indigo-50/90 dark:bg-indigo-950/40 text-neutral-950 dark:text-white border-l-2 border-indigo-500 dark:border-indigo-400 pl-3.5"
                : "text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
            }`}
          >
            <div class="flex items-baseline justify-between gap-2">
              <span class="font-medium text-sm sm:text-base truncate">
                {post.title}
              </span>
              <time class="text-xs text-neutral-400 shrink-0">{post.date}</time>
            </div>
            {post.summary && (
              <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1 line-clamp-1">
                {post.summary}
              </p>
            )}
            {post.tags.length > 0 && (
              <div class="flex flex-wrap gap-1 mt-1.5">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    class="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </a>
        ))}
      </div>

      <div class="px-3 py-2 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-950 text-[11px] text-neutral-400 flex items-center justify-between">
        <span>
          <kbd class="font-sans">↑↓</kbd> 탐색 ·{" "}
          <kbd class="font-sans">Enter</kbd> 열기
        </span>
        <span>
          단축키 <kbd class="font-sans">⌘K</kbd> 또는{" "}
          <kbd class="font-sans">/</kbd>
        </span>
      </div>
    </dialog>
  );
}
