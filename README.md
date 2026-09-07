# iceship.dev

Deno 2와 Fresh 2.x 기반으로 제작된 미니멀 개인 블로그입니다.\
마크다운 파일(`posts/*.md`)을 Git에 커밋하는 것만으로 글이 배포되며, 브라우저
자바스크립트를 전혀 전송하지 않는 **Zero Client JS (100% SSR)** 아키텍처로
동작합니다.

---

## 주요 특징

- **초고속 SSR & 경량 Island 아키텍처**: 기본 페이지는 100% 서버 사이드
  렌더링(Zero Client JS)으로 로딩되며, 코드 복사 등 인터랙션이 필요한 블로그
  상세 페이지에만 최소한의 Island(`islands/CodeCopyHandler.tsx`)가 부분
  하이드레이션됩니다.
- **Git 기반 마크다운 관리**: `posts/` 디렉터리에 YAML Front-matter가 포함된
  마크다운 파일을 작성하면 자동으로 게시됩니다.
- **서버 사이드 신택스 하이라이팅**: Prism.js를 통해 서버 렌더링 시점에 코드
  블록에 하이라이팅 토큰을 적용합니다.
- **코드 블록 원클릭 복사**: 코드 블록 우측 상단에 복사 버튼을 제공하며,
  클립보드 복사 성공 시 시각적 피드백을 제공합니다.
- **헤딩 앵커 & 목차(TOC) 자동 생성**: 마크다운 본문의 `h2`, `h3` 헤딩에 고유
  id와 `#` 공유 링크를 자동 부여하고, 본문 상단에 점프 가능한 목차를
  렌더링합니다.
- **읽는 시간(Reading Time) 자동 계산**: 한글/영문 분량을 분석하여 글 목록과
  상세에 예상 소요 시간(예: `2분 소요`)을 표시합니다.
- **스마트 디스크 I/O 캐싱**: 파일 수정 시간(`mtime`) 기반 인메모리 캐시를
  적용하여, 프로덕션에서는 디스크 I/O 없이 $O(1)$ 속도로 응답하며 로컬 개발
  중에는 파일 수정 시 즉시 자동 갱신됩니다.
- **SEO & 소셜 공유 최적화**:
  - 기본 1200×630 OpenGraph / Twitter Card 썸네일 이미지 (`static/og-image.png`,
    `og-image.svg`)
  - W3C Feed 표준 준수 RSS 2.0 (`/rss.xml`)
  - 자동 생성되는 사이트맵 (`/sitemap.xml`) 및 `robots.txt`
  - 정식 HTTP 404 상태 코드 반환 및 전용 에러 화면(`_error.tsx`)
- **태그 필터링 & 네비게이션**: 태그별 글 모아보기(`/blog?tag=...`) 및 Fresh의
  `data-current`를 활용한 활성 메뉴 자동 강조.
- **OS 다크 모드 자동 추종**: 순수 CSS(`prefers-color-scheme`) 기반으로 브라우저
  테마 설정을 부드럽게 반영합니다.

---

## 기술 스택

| 분류           | 기술                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| **Runtime**    | [Deno 2](https://deno.com/)                                                             |
| **Framework**  | [Fresh 2.x](https://fresh.deno.dev/) (`@fresh/core`, `@fresh/plugin-vite`)              |
| **UI Library** | [Preact](https://preactjs.com/) (SSR 전용)                                              |
| **Styling**    | [Tailwind CSS v4](https://tailwindcss.com/) (`@tailwindcss/vite`)                       |
| **Markdown**   | [Marked](https://marked.js.org/), [Prism.js](https://prismjs.com/), `@std/front-matter` |

---

## 프로젝트 구조

```text
├── .github/
│   └── workflows/deploy.yml # Deno Deploy CI/CD 자동 배포
├── assets/
│   └── styles.css          # Tailwind v4 및 타이포그래피, Prism 토큰 스타일
├── components/
│   ├── Header.tsx          # 사이트 헤더 및 네비게이션 (활성 링크 감지)
│   ├── Footer.tsx          # 사이트 푸터
│   └── PostCard.tsx        # 포스트 목록 카드 컴포넌트
├── islands/
│   └── CodeCopyHandler.tsx # 클라이언트 코드 복사 인터랙션 Island
├── posts/                  # 블로그 글 마크다운 파일 (.md)
├── routes/
│   ├── _app.tsx            # 최상위 HTML 껍질 (Head, 메타태그, 파비콘)
│   ├── _error.tsx          # 통합 에러 페이지 (404 / 500)
│   ├── index.tsx           # 홈 (소개 및 최근 글 5개)
│   ├── about.tsx           # 소개 페이지
│   ├── rss.xml.ts          # RSS 2.0 피드 엔드포인트
│   ├── sitemap.xml.ts      # 동적 sitemap.xml 엔드포인트
│   └── blog/
│       ├── index.tsx       # 글 전체 목록 및 태그 필터링
│       └── [slug].tsx      # 포스트 상세 페이지
├── static/                 # 정적 에셋 (favicon.ico, logo.svg, robots.txt)
├── utils/
│   ├── posts.ts            # 마크다운 파싱, Prism 하이라이팅, mtime 캐시
│   └── utils.ts            # Fresh 2 createDefine 헬퍼
├── client.ts               # Vite 클라이언트 엔트리포인트 (CSS 로드)
├── main.ts                 # Fresh 2 서버 앱 정의 (app.fsRoutes())
├── vite.config.ts          # Vite 번들러 설정 (@fresh/plugin-vite)
└── deno.json               # Deno 작업 명령 및 의존성 매핑
```

---

## 시작하기

### 개발 환경 실행

```bash
# 의존성 설치 및 개발 서버 실행 (Vite HMR)
deno task dev
```

브라우저에서 `http://localhost:8000` (또는 Vite 콘솔에 출력된 주소)으로
접속합니다.

### 코드 검사 및 포맷팅

```bash
# 코드 포맷팅, 린트, 타입 검사를 일괄 수행
deno task check

# 코드 자동 포맷팅
deno fmt
```

### 프로덕션 빌드 및 실행

```bash
# 1. Vite를 통한 정적 에셋 및 SSR 번들 생성 (_fresh/)
deno task build

# 2. 번들된 프로덕션 서버 실행
deno task start
```

---

## 글 작성 방법

`posts/` 폴더에 `원하는-슬러그.md` 파일을 생성하고 상단에 Front-matter를
작성합니다. 파일명이 곧 URL 경로(`/blog/원하는-슬러그`)가 됩니다.

````markdown
---
title: "포스트 제목"
date: "2026-09-07"
tags: ["deno", "fresh", "web"]
summary: "목록 및 메타태그에 노출될 한 줄 요약"
---

# 포스트 제목

여기에 마크다운 본문을 작성합니다.

```typescript
// 코드 블록은 서버 사이드에서 자동으로 문법 강조(Syntax Highlighting)됩니다.
const greeting = "Hello, Deno Fresh!";
console.log(greeting);
```
````

```
---

## 배포 (Deployment)

Fresh 2는 Vite 기반으로 빌드되므로, 프로덕션 실행 전에 `deno task build`가 실행되어 `_fresh/` 산출물이 준비되어야 합니다.

- **Deno Deploy**: GitHub 리포지토리 연동 후, GitHub Actions 워크플로(`deno task build` → `deployctl`)를 통해 배포하거나 Deno Deploy 대시보드 설정을 이용합니다.
- **Docker / 독립 서버**: `deno task build` 후 `deno task start`를 시스템 서비스(systemd, 컨테이너 등)로 띄웁니다.
```
