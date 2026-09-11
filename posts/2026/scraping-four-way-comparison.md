---
title: "fetch vs browserless vs agent-browser vs Firecrawl: 직접 비교해봤다"
date: "2026-09-08"
tags: ["deno", "scraping"]
summary: "같은 JS 렌더링 페이지를 네 가지 방법으로 긁어본 실측 비교"
---

집에 Firecrawl LXC를 띄워놓고도 "그래서 왜 쓰는데?"가 안 와닿았다. 그래서 같은
URL을 네 가지 방법으로 긁어보고 숫자로 비교했다.

## 실험 설정

- 대상: `https://quotes.toscrape.com/js/` (JS로 본문을 렌더링하는 테스트 페이지)
- 방법: 일반 fetch, browserless `/content`, agent-browser
  `open + get text body`, Firecrawl `/v1/scrape`
- 코드는 Deno 단일 파일 (`compare.ts`), 결과는 txt 4종으로 저장

핵심 아이디어는 하나다. 일반 fetch는 JS를 실행하지 못하니, `<script>`를 걷어내고
텍스트를 추출하면 본문이 얼마나 남는지 보면 된다.

```ts
// ① 일반 fetch: HTML만 가져옴 (JS 실행 안 됨)
const html = await (await fetch(URL)).text();
const noScript = html
  .replace(/<script[\s\S]*?<\/script>/gi, "")
  .replace(/<style[\s\S]*?<\/style>/gi, "");
const plainText = noScript
  .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

// ② browserless: headless Chrome으로 JS 실행 후 렌더링된 HTML 반환
const blHtml = await (await fetch(`${BROWSERLESS}/content`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: URL }),
})).text();

// ③ agent-browser: 로컬 크롬 직접 조종 후 렌더링된 텍스트 추출
await new Deno.Command("agent-browser", { args: ["open", URL] }).output();
const abOut = await new Deno.Command(
  "agent-browser",
  { args: ["get", "text", "body"], stdout: "piped" },
).output();

// ④ Firecrawl: JS 실행 후 markdown으로 정제해서 반환
const res = await (await fetch(`${FIRECRAWL}/v1/scrape`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: URL, formats: ["markdown"] }),
})).json();
```

## 실측 결과

|                 | fetch        | browserless         | agent-browser         | Firecrawl           |
| --------------- | ------------ | ------------------- | --------------------- | ------------------- |
| 받는 것         | HTML 5,806자 | 렌더링 HTML 8,941자 | 렌더링 텍스트 1,499자 | markdown 1,574자    |
| 본문 추출       | 0건 ❌       | 10건 ✅ (정제 직접) | 10건 ✅ (정제 불필요) | 10건 ✅ (링크 포함) |
| "Einstein" 검색 | 없음         | 있음                | 있음                  | 있음                |

일반 fetch는 5,806자를 받아놓고 정작 본문은 0건이었다. 헤더·푸터 껍데기 96자만
남는다. 반면 나머지 셋은 명언 10건을 전부 뽑았다.

## 그래서 언제 뭘 쓰나

- **정적 페이지** → fetch. 의존성 없이 한 줄이면 된다.
- **동적 페이지 + 파싱 직접** → browserless. 원격 크롬 API라 서버에 올려두고
  여러 곳에서 호출하기 좋다.
- **탐색형 작업 (로그인, 폼, 페이지 넘기기)** → agent-browser. `snapshot`으로
  보고 `click`·`type`으로 조종하는 게 제일 자연스럽다. 로그인 후 세션 유지도
  편하다.
- **스크랩 → LLM 직행** → Firecrawl. 렌더링 + markdown 정제 + 링크 절대경로까지
  끝나서 바로 RAG·요약에 넣을 수 있다.

로그인이 필요한 사이트는 browserless나 agent-browser가 어울린다. 로그인은
예외투성이(리다이렉트, 2차 인증)라 정해진 액션보다 코드를 직접 짜는 쪽이
유리하고, 표준 패턴도 단순하다: 로그인 → 쿠키 저장 → 이후 요청에 주입.

## 쿠팡은 전부 막혔다

덤으로 쿠팡 검색 페이지에 세 방법을 던져봤는데 **전부 403**이었다. fetch도,
Firecrawl도, 진짜 크롬인 browserless도 Akamai 봇 방어에 걸렸다.

이건 도구 선택 문제가 아니라 차단 문제다.

## 한 줄 정리

> browserless는 "렌더링된 DOM", agent-browser는 "내 손 크롬", Firecrawl은 "LLM용
> 정제 텍스트" — 정적이면 fetch로 충분하다.
