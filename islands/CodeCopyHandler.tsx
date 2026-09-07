import { useEffect } from "preact/hooks";

export default function CodeCopyHandler() {
  useEffect(() => {
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
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return null;
}
