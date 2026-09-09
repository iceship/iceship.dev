---
title: "Astro에서 Fresh 2로: 모던 웹 표준과 0-JS로 완성한 초고속 블로그 구축기"
date: "2026-09-09"
summary: "Astro 블로그를 Deno Fresh 2로 마이그레이션하며 View Transitions, Speculation Rules, Electric Violet 테마, 그리고 이미지 최적화까지 적용한 풀스택 여정기"
tags: ["fresh", "deno", "web-standards", "performance", "blog"]
---

## TL;DR

기존에 Bun + Astro 기반으로 운영하던 블로그를 **Deno 2 + Fresh 2** 환경으로
완전히 이관했다. 이전하는 김에 구글의 최신 웹
가이드라인(`modern-web-guidance`)을 적극 도입하여 다음 작업들을 한 번에 끝냈다:

- **0-JS 네이티브 전환**: 크로스 도큐먼트 뷰 트랜지션(`@view-transition`),
  스크롤 진행률 바, 스크롤 리빌 애니메이션
- **체감 0ms 로딩**: `Speculation Rules API`(마우스 호버 시 사전 렌더링)와 정적
  에셋 불변 캐싱
- **개발자 UX**: 네이티브 `<dialog>` 기반 `⌘K` 검색 모달, 우측 스티키
  목차(TOC) + Scroll-Spy, 스마트 탑 버튼, 클린 인쇄 모드(`@media print`)
- **디자인 아이덴티티**: `oklch()` 색공간 기반 **Electric Violet 🔮** 브랜드
  디자인 토큰 구축
- **이미지 자동화**: `sharp` 기반 원클릭 WebP 변환(`deno task optimize:images`,
  용량 80% 절감)

---

## 1. 배경: 왜 Astro에서 Fresh 2로 옮겼는가?

기존 블로그(`astro-bun-blog`)도 만족스럽게 쓰고 있었지만, 홈랩 환경과 사이드
프로젝트에서 Deno 2 생태계를 깊게 활용하기 시작하면서 **"블로그도 Deno 네이티브
환경(Fresh 2 + Deno Deploy)으로 일원화하자"**는 생각이 들었다.

Fresh 2의 매력은 명확하다:

- **No Build Step, Instant Startup**: 복잡한 번들링 파이프라인 없이 Deno의
  네이티브 TS 지원으로 가볍다.
- **Islands Architecture**: 필요한 인터랙션(검색창, 복사 토스트, 탑 버튼)에만
  최소한의 JS 아일랜드를 전송하고 나머지는 100% 정적 HTML로 서빙한다.
- **글로벌 엣지 배포**: Deno Deploy 자체가 서울(ICN)을 포함한 전 세계 35+
  데이터센터에 분산 배포되므로 별도의 복잡한 인프라 설정 없이 첫 응답이 10ms
  안팎으로 떨어진다.

---

## 2. 마이그레이션과 URL 리디렉션의 함정

예전 블로그의 글과 에셋들을 옮기면서 가장 먼저 신경 쓴 부분은 **기존 URL 링크의
연속성**과 **보안**이었다.

### 트레일링 슬래시(`/`)와 404 리디렉션 이슈

Astro는 기본적으로 URL 끝에 트레일링 슬래시를 붙이는
관례(`blog.iceship.dev/posts/hono-basic/`)를 썼는데, Fresh의 라우터는 슬래시
유무에 민감하여 Cloudflare에서 넘겨준 주소가 404로 떨어지는 문제가 있었다.

이를 해결하기 위해 `main.ts` 최상단에 미들웨어를 두어 `/posts` 및 `/posts/*`로
들어오는 모든 요청의 끝 슬래시를 정리하고 `/blog/*`로 301 영구 이동시켰다:

```ts
// main.ts: 301 영구 리디렉션 미들웨어
app.use(async (ctx) => {
  const pathname = ctx.url.pathname;
  if (pathname === "/posts" || pathname === "/posts/") {
    return new Response(null, {
      status: 301,
      headers: { Location: `/blog${ctx.url.search}` },
    });
  }
  if (pathname.startsWith("/posts/")) {
    const slug = pathname.slice("/posts/".length).replace(/\/+$/, "");
    return new Response(null, {
      status: 301,
      headers: {
        Location: `/blog/${encodeURIComponent(slug)}${ctx.url.search}`,
      },
    });
  }
  return await ctx.next();
});
```

동시에 경로 순회 공격(`../`, `\0`)을 방어하는 슬러그 검증 로직과
`X-Content-Type-Options`, `X-Frame-Options` 등 필수 보안 헤더도 미들웨어에
완벽히 채워 넣었다.

---

## 3. modern-web-guidance로 0-JS 마법 부리기

단순 이전으로 끝내기 아쉬워, 무거운 JS 라이브러리를 걷어내고 최신 웹 브라우저
네이티브 기능들을 블로그에 녹여냈다.

### ① 크로스 도큐먼트 뷰 트랜지션 (Cross-document View Transitions)

SPA(Single Page App) 프레임워크를 쓰지 않아도, CSS 단 몇 줄로 페이지 이동 시
부드러운 크로스페이드가 일어난다:

```css
@media (prefers-reduced-motion: no-preference) {
  @view-transition {
    navigation: auto;
  }
}
::view-transition-old(root) {
  animation: 140ms ease-out both fade-out;
}
::view-transition-new(root) {
  animation: 180ms ease-in both fade-in;
}
```

### ② 스크롤-드리븐 애니메이션 (Scroll-driven Animations)

상단 읽기 진행률 바(`reading-progress-bar`)와 글 목록 카드 리빌 효과를 JS 이벤트
리스너 없이 브라우저 합성기(Compositor) 레벨에서 구현했다:

```css
/* 읽기 진행률 바 */
.reading-progress-bar {
  animation: reading-progress auto linear;
  animation-timeline: scroll();
}

/* 스크롤 시 카드가 사르르 떠오르는 리빌 */
@supports ((animation-timeline: view()) and (animation-range: entry)) {
  .post-entry {
    animation: card-entry-reveal auto linear backwards;
    animation-timeline: view(block);
    animation-range: entry 0% cover 25%;
  }
}
```

### ③ content-visibility를 통한 렌더링 스킵

화면 밖(스크롤 아래)에 있는 긴 코드 블록과 카드들은 브라우저가 레이아웃 렌더링
계산을 미리 하지 않도록 `content-visibility: auto`를 걸어두어 초기 로딩 시 CPU
낭비를 막았다.

---

## 4. 사용자 편의(UX) 디테일 채우기

기술 글을 편안하게 읽을 수 있도록 데스크톱과 모바일 환경 모두를 배려했다.

1. **우측 스티키 TOC + Scroll-Spy**: 화면 우측에 목차를 고정하고,
   `IntersectionObserver`로 현재 읽고 있는 헤딩을 실시간으로 추적하여
   하이라이트한다. 모바일에서는 `<details>` 접힘 블록으로 자연스럽게 전환된다.
2. **초경량 `⌘K` 검색 모달**: 무거운 외장 검색 엔진 없이, 네이티브 `<dialog>`와
   2KB짜리 메타데이터 API(`/api/search`)를 조합했다. 키보드 방향키(`↑↓`),
   `Enter`, `Esc` 조작이 매끄럽다.
3. **스마트 플로팅 탑 버튼**: 최상단에서는 숨어있다가 300px 이상 스크롤할 때만
   나타나는 플로팅 버튼을 배치했다.
4. **코드 복사 토스트 피드백**: 코드 복사 시 버튼 자체의 피드백뿐 아니라 화면
   하단에 미니 토스트(`코드가 클립보드에 복사되었습니다 ✓`)가 떠오른다.
5. **클린 인쇄 & PDF 내보내기 모드 (`@media print`)**: 유용한 가이드를 `⌘P`로
   인쇄하거나 PDF로 저장할 때, 네비게이션, 푸터, TOC, 버튼들을 자동으로 날리고
   깔끔한 출판물 형태로 렌더링한다.

---

## 5. 나만의 색을 입히다: Electric Violet 🔮 & 버그 디버깅

미니멀한 흑백 톤 위에 Raycast와 Linear 스타일의 지적인 보라색을 시그니처
액센트로 결정했다.

### oklch() 색공간과 light-dark()

다크 모드와 라이트 모드 간의 명도 왜곡을 없애기 위해 인간 중심 색공간인
`oklch()`를 사용했다:

```css
:root {
  --accent-light: oklch(0.58 0.22 275); /* 인디고 계열 */
  --accent-dark: oklch(0.72 0.18 275); /* 밝고 선명한 바이올렛 */
  --accent: light-dark(var(--accent-light), var(--accent-dark));
  accent-color: var(--accent);
}
```

이 시그니처 컬러를 로고의 `iceship.dev`, 텍스트 선택 드래그(`::selection`), 태그
뱃지, 읽기 진행률 바, 검색 모달 하이라이트에 절제감 있게 입혔다.

### 🐛 디버깅 노트: 코드 블록 가로 잘림 현상

코드 블록 가로 스크롤 시 부드러운 페이드를 주려고 넣었던 CSS
`mask-image: linear-gradient(to right, ...)` 속성이 긴 코드 끝부분(토큰 값, URL
끝자리 등)을 투명하게 지워버리는 문제가 발생했다.

기술 블로그에서는 긴 코드 한 줄의 마지막 글자 하나까지 온전하게 보여야 하므로,
마스크 효과를 즉시 제거하고 **7px 슬림 커스텀 스크롤바**로 깔끔하게 처리했다.

---

## 6. 이미지 파이프라인과 체감 0ms 성능 극대화

### 원클릭 이미지 최적화 (`deno task optimize:images`)

블로그를 운영하다 보면 스크린샷 캡처(PNG)를 그대로 올려 깃 저장소와 방문자
데이터가 낭비되기 쉽다. 이를 방지하기 위해 Deno 내장 `sharp` 엔진으로 자동화
스크립트를 작성했다:

```bash
deno task optimize:images
```

이 명령어 한 줄이면:

1. `static/images/blog/` 안의 대용량 PNG/JPG를 자동 탐색
2. 레티나 2x 규격(최대 1400px)으로 리사이즈
3. 고품질 WebP(퀄리티 82%)로 압축 변환 (용량 80~90% 절감!)
4. `posts/*.md` 글 안에 적힌 이미지 경로를 `.png`에서 `.webp`로 일괄 자동 수정
5. 필요 없어진 무거운 원본 PNG는 자동 삭제

실제로 기존 PNG 파일들이 **272KB ➡️ 40KB** 수준으로 다이어트되었다.

### Speculation Rules API로 '클릭 즉시 로딩'

브라우저 신기술인 **Speculation Rules**를 도입하여, 방문자가 글 링크 위에
마우스를 0.2초 이상 올리고(Hover) 있으면 백그라운드에서 다음 페이지를 미리
가져와 렌더링해 둔다. 방문자가 링크를 클릭하는 순간 로딩 시간 없이
**0ms(즉시)**로 다음 글이 펼쳐진다.

여기에 정적 이미지와 에셋에 강력한 `Cache-Control`(1일 브라우저 캐시, 7일
재검증)을 달아주어 재방문 시에는 네트워크 통신조차 필요 없게 만들었다.

---

## 마치며

블로그를 옮기고 다듬는 과정은 단순한 플랫폼 교체가 아니라, **"웹이 기본으로
제공하는 최신 표준 기술만으로 어디까지 가볍고 우아한 경험을 만들 수 있는가?"**를
직접 실험해 본 즐거운 여정이었다.

앞으로 홈랩 운영 일지, 쿠버네티스/네트워크 구성, 자동화 파이프라인에 관한
이야기들을 이 가볍고 빠른 공간에 차곡차곡 기록해 나갈 예정이다.
