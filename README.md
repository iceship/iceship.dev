# iceship.dev

[iceship.dev](https://iceship.dev)는 **Deno 2**와 **Fresh 2.x** 기반으로 구축된
고성능 미니멀 개인 기술 블로그입니다.\
글은 연도별 마크다운 파일(`posts/YYYY/*.md`)로 관리되며, Git에 커밋하는 것만으로
자동 배포됩니다. 본문은 **서버 렌더링(SSR)**으로 제공하고, 페이지 전환에는
Fresh의 Partial 런타임을, 코드 복사에는 **Island 아키텍처**를 사용합니다.

---

## 목차

- [주요 특징](#주요-특징)
- [핵심 아키텍처](#핵심-아키텍처)
- [기술 스택](#기술-스택)
- [디렉터리 구조](#디렉터리-구조)
- [시작하기](#시작하기)
- [글 작성 가이드](#글-작성-가이드)
- [CI/CD 및 배포 파이프라인](#cicd-및-배포-파이프라인)
- [설정 및 아키텍처 FAQ](#설정-및-아키텍처-faq)

---

## 주요 특징

- **초고속 SSR & 경량 Island 아키텍처**:
  - 모든 페이지는 서버에서 HTML로 렌더링되며, 클라이언트 내비게이션을 위한 Fresh
    런타임도 로드됩니다.
  - 블로그 상세 페이지(`/blog/[slug]`)에서는 코드 복사용
    Island(`islands/CodeCopyHandler.tsx`)를 추가로 하이드레이션합니다.
- **Git 기반 마크다운 관리**: `posts/` 디렉터리에 YAML Front-matter가 포함된
  마크다운 파일을 커밋하면 즉시 반영됩니다.
- **서버 사이드 신택스 하이라이팅**: Prism.js를 통해 서버 렌더링 시점에 코드
  블록에 하이라이팅 토큰을 적용합니다 (`ts`, `js`, `jsx`, `tsx`, `json`, `md`,
  `bash`, `css`, `yaml` 등 지원).
- **코드 블록 원클릭 복사**: 코드 블록 우측 상단에 `Copy` 버튼을 제공하며,
  클립보드 복사 성공 시 `Copied ✓` 시각 피드백을 제공합니다.
- **헤딩 앵커 & 접이식 목차(TOC) 자동 생성**: 마크다운 본문의 `h2`, `h3` 헤딩에
  고유 id와 `#` 공유 링크를 자동 부여하고, 본문 상단에 접을 수 있는 반응형
  목차(`<details open>`)를 자동 렌더링합니다.
- **읽는 시간(Reading Time) 자동 계산**: 한글(분당 ~400자)과 영문(분당 ~200단어)
  분량을 분석하여 글 목록과 상세에 예상 소요 시간(예: `2분 소요`)을 노출합니다.
- **스마트 디스크 I/O 캐싱**: 파일 수정 시간(`mtime`) 기반 인메모리 캐시를
  적용하여, 프로덕션에서는 디스크 읽기 없이 $O(1)$ 속도로 응답하며 로컬 개발
  중에는 파일 수정 시 즉시 자동 갱신됩니다.
- **SEO & 소셜 공유 최적화**:
  - 기본 1200×630 OpenGraph / Twitter Card 썸네일 이미지 (`static/og-image.png`,
    `og-image.svg`)
  - W3C Feed 표준 준수 RSS 2.0 (`/rss.xml`) 및 `<link rel="alternate">` 자동
    감지
  - 동적 사이트맵 (`/sitemap.xml`) 및 검색 로봇 배제 표준(`robots.txt`)
  - 정식 HTTP 404 상태 코드 반환 및 테마 일치 에러 화면(`_error.tsx`)
- **태그 필터링 & 활성 링크 감지**: 태그별 글 모아보기(`/blog?tag=...`) 및
  Fresh의 `data-current` 속성을 활용한 현재 활성 메뉴 자동 하이라이트.
- **즉시 콘텐츠 교체**: `<Partial name="page">`와 `f-client-nav`로 전체 새로고침
  없이 이동합니다. `f-view-transition={false}`로 스냅샷 교차 페이드와 이동
  애니메이션을 끄고, 응답 도착 시 본문을 교체합니다. RSS는 일반 이동을
  사용합니다.
- **OS 다크 모드 자동 추종**: 순수 CSS(`prefers-color-scheme`) 기반으로 OS 테마
  설정을 부드럽게 반영합니다.

---

## 핵심 아키텍처

```
[ Git Push (main) ]
       │
       ├───> [ GitHub Actions (CI) ] ──> deno task check & deno task build 무결성 검증
       │
       └───> [ Deno Deploy (App: iceshipdev) ]
                   │
                   ├── 1. deno install (의존성 설치)
                   ├── 2. deno task build (Vite 번들링 -> _fresh/ 산출물 생성)
                   └── 3. 글로벌 엣지 런타임 배포 (https://iceship.dev)
```

1. **Vite 기반 빌드 시스템**: Fresh 2는 Vite 번들러를 채택하여 `client.ts`와
   `assets/styles.css`를 빌드 타임에 컴파일하고, `_fresh/client` 및
   `_fresh/server`로 최적화된 번들을 생성합니다.
2. **점진적 향상(Progressive Enhancement)**: 마크다운 렌더러가 HTML 구조(코드
   블록, 복사 버튼, 목차)를 서버에서 완전하게 조립하므로, 자바스크립트가
   차단되거나 느린 환경에서도 깨짐 없는 완벽한 레이아웃을 보장합니다.
3. **인메모리 스마트 캐싱**: 매 요청마다 마크다운 파일을 디스크에서 순차
   탐색하는 병목을 방지하기 위해 `Deno.stat`의 `mtime` 타임스탬프를 키로
   캐시합니다. 프로덕션 환경에서는 최초 1회 파싱 후 메모리에서 즉각 응답합니다.

---

## 기술 스택

| 분류                    | 기술                                                  | 버전 / 비고                                    |
| ----------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| **Runtime**             | [Deno](https://deno.com/)                             | `v2.x` (현재 Deno 2.9+)                        |
| **Framework**           | [Fresh](https://fresh.deno.dev/)                      | `v2.x` (`@fresh/core`, `@fresh/plugin-vite`)   |
| **UI Library**          | [Preact](https://preactjs.com/)                       | `v10.x` (SSR 기본, 선택적 Island 하이드레이션) |
| **Bundler**             | [Vite](https://vitejs.dev/)                           | `v7.x`                                         |
| **Styling**             | [Tailwind CSS](https://tailwindcss.com/)              | `v4.x` (`@tailwindcss/vite`)                   |
| **Markdown**            | [Marked](https://marked.js.org/)                      | `v16.x`                                        |
| **Syntax Highlighting** | [Prism.js](https://prismjs.com/)                      | `v1.30.x` (서버 사이드 토큰 분해)              |
| **Front-matter**        | [@std/front-matter](https://jsr.io/@std/front-matter) | `v1.x` (YAML 파싱)                             |
| **Hosting**             | [Deno Deploy](https://deno.com/deploy)                | 글로벌 Anycast 엣지 런타임                     |

---

## 디렉터리 구조

```text
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions: 코드 검사(check) 및 빌드(build) 검증
├── assets/
│   └── styles.css             # Tailwind v4 지시어, 타이포그래피, Prism 토큰 스타일
├── components/
│   ├── Header.tsx             # 상단 헤더 및 네비게이션 (data-current 활성 링크 스타일링)
│   ├── Footer.tsx             # 하단 푸터 (카피라이트 및 외부 링크)
│   └── PostCard.tsx           # 글 목록용 카드 컴포넌트 (날짜, 읽는 시간, 태그 노출)
├── islands/
│   └── CodeCopyHandler.tsx    # 코드 블록 복사 이벤트 위임 처리 Island (클라이언트 하이드레이션)
├── posts/                     # 블로그 포스트 마크다운 파일 (.md)
│   ├── 2025/                  # 2025년 작성 글 (연도별 아카이브)
│   │   ├── about-blog.md
│   │   └── proxmox-console-autologin.md
│   └── 2026/                  # 2026년 작성 글 (필요 시 2026/09/ 등 월별 폴더도 자동 지원)
│       ├── hello.md
│       └── matter-thread-multi-border-router-recovery.md
├── routes/
│   ├── _app.tsx               # 최상위 HTML 껍질 (Head, 메타태그, 파비콘, 레이아웃)
│   ├── _error.tsx             # Fresh 2 통합 에러 페이지 (404 Not Found 및 500 에러)
│   ├── index.tsx              # 메인 홈 화면 (소개 및 최근 글 5개)
│   ├── about.tsx              # 소개 페이지
│   ├── rss.xml.ts             # W3C 표준 RSS 2.0 피드 엔드포인트
│   ├── sitemap.xml.ts         # 검색 엔진 색인용 sitemap.xml 엔드포인트
│   └── blog/
│       ├── index.tsx          # 블로그 전체 글 목록 및 태그 필터링 (/blog?tag=...)
│       └── [slug].tsx         # 포스트 상세 페이지 (TOC, 헤딩 앵커, 본문, 이전/다음 글)
├── static/                    # 정적 파일 서빙 디렉터리
│   ├── favicon.ico
│   ├── logo.svg
│   ├── og-image.png           # 1200x630 SNS 공유용 대표 이미지
│   ├── og-image.svg
│   └── robots.txt             # 검색 로봇 배제 표준 및 Sitemap URL 지정
├── utils/
│   ├── posts.ts               # 마크다운 파싱, Prism 토큰화, TOC/읽는시간 계산, mtime 캐시
│   └── utils.ts               # Fresh 2 createDefine<State>() 헬퍼
├── client.ts                  # Vite 클라이언트 엔트리포인트 (CSS 로드용)
├── main.ts                    # Fresh 2 서버 앱 선언 (app.fsRoutes(), app.use(staticFiles()))
├── vite.config.ts             # Vite 플러그인 설정 (fresh(), tailwindcss())
└── deno.json                  # Deno 작업 스크립트, 의존성 매핑, 컴파일러 옵션
```

---

## 시작하기

### 1. 개발 환경 실행

```bash
# 의존성 설치 및 로컬 개발 서버 시작 (Vite HMR 지원)
deno task dev
```

브라우저에서 콘솔에 출력된 로컬 주소(기본: `http://localhost:8000` 또는
`http://localhost:5173`)로 접속합니다.

### 2. 코드 품질 검사 및 포맷팅

```bash
# 포맷팅 검사, Deno 린트, TypeScript 타입 검사를 일괄 수행
deno task check

# 코드 자동 포맷팅
deno fmt
```

### 3. 프로덕션 빌드 및 로컬 테스트

```bash
# 1. Vite를 통한 SSR 번들 및 클라이언트 에셋 빌드 (_fresh/ 생성)
deno task build

# 2. 번들된 프로덕션 서버 실행
deno task start
```

---

## 글 작성 가이드

`posts/` 디렉터리 내에 연도별 폴더(예: `posts/2026/`)를 만들고 `[슬러그].md`
파일을 추가하면 별도의 설정 없이 파일명이 곧 게시글의 고유 URL이 됩니다.\
예: `posts/2026/matter-thread-recovery.md` →
`https://iceship.dev/blog/matter-thread-recovery`

> [!TIP]
>
> - **계층 디렉터리 지원**: `posts/2026/글이름.md`는 물론, 글이 많아질 경우
>   `posts/2026/09/글이름.md`처럼 월별 서브폴더를 두어도 로더가 재귀적으로 자동
>   인식합니다.
> - **URL 불변성**: 파일이 어느 연도/월 폴더에 있든 실제 블로그 URL은 언제나
>   간결한 `/blog/[slug]` 형태로 서비스됩니다.
> - **슬러그 고유성**: 서로 다른 연도 폴더에 있더라도 파일명(slug)은 고유해야
>   합니다. 중복된 슬러그가 존재할 경우 사전 빌드
>   검증(`deno task validate:posts`) 단계에서 즉시 감지하여 차단합니다.

---

### 마크다운 포맷 명세 (Markdown Format)

글은 최상단 **YAML Front-matter**와 본문 **GitHub Flavored Markdown(GFM)**으로
구성됩니다.

#### 1. Front-matter 필드 규칙

| 필드      | 필수 여부 | 타입       | 형식 및 설명                                                                                                                           |
| :-------- | :-------: | :--------- | :------------------------------------------------------------------------------------------------------------------------------------- |
| `title`   | **필수**  | `string`   | 글 제목 (따옴표로 감싸기)                                                                                                              |
| `date`    | **필수**  | `string`   | 발행일. **반드시 따옴표로 감싼 `"YYYY-MM-DD"` 문자열** (예: `"2026-09-11"`, 따옴표 누락 시 YAML 파서가 Date 객체로 해석하여 빌드 실패) |
| `summary` | **필수**  | `string`   | 글 목록 카드 및 SNS OpenGraph 요약문 (`description`이 아닌 `summary` 사용)                                                             |
| `tags`    |   선택    | `string[]` | 태그 목록. 소문자/케밥케이스 인라인 배열 권장 (예: `["proxmox", "ha", "zfs"]`)                                                         |

_(참고: `draft` 등의 미정의 필드는 지원하지 않으므로 포함하지 않습니다.)_

#### 2. 본문 작성 규격

- **헤딩 및 접이식 목차(TOC)**:
  - 본문 대제목은 이미 페이지 헤더로 출력되므로, 본문 소제목은 `##` (h2) 또는
    `###` (h3)부터 시작합니다.
  - `##`, `###` 헤딩은 본문 상단 반응형 목차(TOC)에 자동 수집되며, 마우스 호버
    시 링크 복사용 `#` 앵커가 자동 생성됩니다.
- **코드 블록 및 원클릭 복사**:
  - 코드 블록에 언어 식별자(`bash`, `typescript`, `javascript`, `json`, `yaml`,
    `markdown`, `css` 등)를 지정하면 서버 사이드 신택스 하이라이팅과 우측 상단
    `Copy` 버튼이 자동 활성화됩니다.
- **이미지 및 캡션 렌더링**:
  - `![대체 텍스트 및 캡션](/images/blog/example.webp)`
  - 마크다운 대체 텍스트(alt)를 작성하면 이미지 하단에 `<figcaption>` 캡션이
    자동으로 생성됩니다.
  - 이미지는 `static/images/blog/`에 저장하며, `loading="lazy"`와
    `decoding="async"`가 자동 적용됩니다.
- **안전한 외부 링크**:
  - `https://...` 형식의 외부 링크는 보안을 위해
    `target="_blank" rel="noopener noreferrer"`가 자동 부여됩니다.
  - `javascript:`, `data:` 등 잠재적 위험 프로토콜은 자동으로 `#` 처리됩니다.

---

### 마크다운 템플릿 예시

새 글을 작성할 때 아래 템플릿을 복사하여 `posts/YYYY/slug-name.md`로 저장하세요:

````markdown
---
title: "게시글 제목을 입력하세요"
date: "2026-09-11"
tags: ["proxmox", "linux", "automation"]
summary: "글 목록 카드 및 SNS 공유 메타태그에 노출될 1~2줄 요약문입니다."
---

글 도입부 본문입니다. GitHub Flavored Markdown(GFM) 표준 문법을 따릅니다.

> 참고 메모나 주의사항은 인용 블록을 사용합니다.

## 1. 첫 번째 주제 (h2)

설명 텍스트입니다. 링크는 [Deno 공식 문서](https://deno.com)처럼 작성하면 외부
링크가 새 창으로 열립니다.

### 1.1 하위 세부 내용 (h3)

코드 예시입니다:

```bash
# 명령어 실행 예시
deno task check
```

## 2. 두 번째 주제

이미지는 다음과 같이 첨부합니다:

![시스템 아키텍처 다이어그램](/images/blog/architecture-sample.webp)
````

---

### 글 검증 및 테스트 명령어

```bash
# 1. 모든 포스트의 Front-matter 무결성, 날짜 형식, 중복 슬러그 일괄 검증
deno task validate:posts

# 2. 포스트 로더 및 단위 테스트 실행
deno task test
```

---

## CI/CD 및 배포 파이프라인

본 프로젝트는 **GitHub Actions(CI)**와 **Deno Deploy(배포)**가 각자의 역할에
맞게 분리되어 동작합니다.

### 1. GitHub Actions (`.github/workflows/ci.yml`)

- `main` 브랜치로의 푸시 또는 풀 리퀘스트 생성 시 자동으로 실행됩니다.
- `deno task check`(포맷, 린트, 타입 검사), `deno task test`(글 검증 및 로딩
  테스트), `deno task build`(글 검증 후 Vite 빌드)를 수행합니다.

### 2. Deno Deploy 네이티브 연동 (`iceshipdev`)

- Deno Deploy 대시보드에서 `iceship/iceship.dev` 저장소가 **Fresh 프리셋**으로
  연결되어 있습니다.
- `main` 브랜치에 커밋이 푸시되면 Deno Deploy가 엣지 인프라에서 다음 과정을
  자동으로 실행합니다:
  - **Install command**: `deno install`
  - **Build command**: `deno task build`
  - **Runtime**: `deno serve -A _fresh/server.js` 기반 Anycast 글로벌 배포
- 별도의 배포 토큰(`deployctl`) 관리 없이도 가장 안정적이고 빠른 제로 다운타임
  배포가 이루어집니다.

---

## 설정 및 아키텍처 FAQ

### Q1. `deno.json`에서 `"nodeModulesDir": "auto"`로 설정한 이유는 무엇인가요?

Deno 2는 Vite 번들러 및 npm 패키지와 연동할 때 `node_modules` 디렉터리를
참조합니다. `"auto"`로 지정해 두면 별도로 `deno install`을 매번 신경 쓰지 않아도
Deno가 패키지 의존성을 자동으로 동기화하여, CI/CD 환경이나 신규 머신에서 발생할
수 있는 `Could not find a matching package in node_modules` 타입 해석 오류를
방지합니다.

### Q2. `deno.json`의 `exclude`에 `**/_fresh/*`와 `vite.config.ts`가 있는 이유는?

- **`**/_fresh/*`**: Vite 빌드 결과물이 저장되는 폴더입니다. 수십 개의
  최소화(minified)된 번들 파일을 `deno check`나 `deno lint`가 불필요하게
  검사하여 속도가 느려지거나 오류를 내는 것을 방지합니다.
- **`vite.config.ts`**: Vite 전용 빌드 환경 설정 파일이므로, Preact/DOM 중심의
  앱 런타임 타입 검사기(`deno check`)의 검사 범위에서 격리하여 경고를
  방지합니다.

### Q3. `utils/posts.ts`에서 경로를 `Deno.cwd()` 기준으로 잡은 이유는?

Fresh 2는 Vite로 빌드된 후 `_fresh/server/server-entry.mjs` 번들 파일로
실행됩니다. `import.meta.url` 기준으로 상대 경로를 계산하면 번들 내부 경로가
어긋나 Deno Deploy 환경에서 포스트 파일을 찾지 못하고 500 에러가 발생할 수
있습니다. 프로젝트 루트를 가리키는 `Deno.cwd()`를 사용해야 로컬과 배포 환경
모두에서 일관되게 `posts/` 디렉터리에 접근할 수 있습니다.

### Q4. 페이지 전환에 애니메이션이 없는 이유는?

`routes/_app.tsx`는 `f-client-nav`와 `<Partial name="page">`로 페이지를
갱신하며, `f-view-transition={false}`로 View Transitions 애니메이션을 명시적으로
끕니다. 기존의 이전/다음 화면 교차 페이드와 수직 이동은 글자를 겹쳐 보이게
했습니다. 현재는 응답이 도착할 때까지 기존 내용을 유지하고, 도착하면 바로
교체합니다. 네트워크 응답 시간 자체가 사라지는 것은 아닙니다.

Partial에는 헤더, 본문, 푸터가 포함되며 활성 메뉴도 갱신됩니다. 메뉴는 활성
상태에서 굵기를 바꾸지 않아 가로 움직임을 줄입니다. JavaScript가 꺼져 있으면
일반 링크로 이동합니다. RSS는 `f-client-nav={false}`로 일반 이동을 사용합니다.

`_layout.tsx`는 필수가 아닙니다. 경로별 공통 UI가 필요해지면 분리할 수 있습니다.
