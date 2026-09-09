import { useEffect } from "preact/hooks";

export default function TocActiveHandler() {
  useEffect(() => {
    const links = Array.from(
      document.querySelectorAll<HTMLAnchorElement>(".post-toc-link"),
    );
    if (links.length === 0) return;

    const headingMap = links
      .map((link) => {
        const id = link.getAttribute("data-toc-id");
        const el = id ? document.getElementById(id) : null;
        return el ? { link, el } : null;
      })
      .filter((item): item is { link: HTMLAnchorElement; el: HTMLElement } =>
        item !== null
      );

    if (headingMap.length === 0) return;

    let ticking = false;

    function updateActive() {
      // 헤딩 위치를 기준으로 현재 뷰포트 상단(~130px)을 지난 가장 최근 헤딩 검색
      let activeIndex = 0;
      for (let i = 0; i < headingMap.length; i++) {
        const rect = headingMap[i].el.getBoundingClientRect();
        if (rect.top <= 130) {
          activeIndex = i;
        } else {
          break;
        }
      }

      headingMap.forEach((item, idx) => {
        if (idx === activeIndex) {
          item.link.classList.add("active");
        } else {
          item.link.classList.remove("active");
        }
      });

      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(updateActive);
        ticking = true;
      }
    }

    globalThis.addEventListener("scroll", onScroll, { passive: true });
    updateActive();

    return () => {
      globalThis.removeEventListener("scroll", onScroll);
    };
  }, []);

  return null;
}
