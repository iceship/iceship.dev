import { useEffect, useState } from "preact/hooks";

export default function CodeCopyHandler() {
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const btn = target?.closest<HTMLButtonElement>(".code-copy-btn");
      if (!btn) return;

      const code = btn.dataset.code;
      if (code === undefined) return;

      navigator.clipboard.writeText(code).then(() => {
        const originalText = btn.textContent;
        btn.textContent = "Copied ✓";
        btn.classList.add("text-emerald-400", "border-emerald-500/60");

        setToastMessage("코드가 클립보드에 복사되었습니다 ✓");
        clearTimeout(timer);
        timer = setTimeout(() => {
          setToastMessage(null);
        }, 2200);

        setTimeout(() => {
          btn.textContent = originalText || "Copy";
          btn.classList.remove("text-emerald-400", "border-emerald-500/60");
        }, 1800);
      }).catch(() => {
        btn.textContent = "Failed";
        setTimeout(() => {
          btn.textContent = "Copy";
        }, 1800);
      });
    }

    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("click", handleClick);
      clearTimeout(timer);
    };
  }, []);

  if (!toastMessage) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      class="copy-toast fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-neutral-900/90 dark:bg-neutral-100/90 text-neutral-100 dark:text-neutral-900 text-xs sm:text-sm font-medium shadow-lg backdrop-blur-md border border-neutral-700/60 dark:border-neutral-300/60 pointer-events-none transition-all duration-200 animate-fade-in"
    >
      {toastMessage}
    </div>
  );
}
