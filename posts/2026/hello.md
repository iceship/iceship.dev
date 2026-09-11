---
title: "Fresh로 미니멀 블로그 시작하기"
date: "2026-09-07"
tags: ["deno", "fresh"]
summary: "왜 Fresh로 개인 블로그를 만드는지, 앞으로 뭘 할 건지 정리"
---

개인 블로그를 다시 만든다. 조건은 단순하다.

- 글은 마크다운으로, GitHub에 그대로 커밋
- 디자인은 미니멀 텍스트 중심
- 댓글, 조회수 같은 동적 기능은 나중 (지금은 없음)
- 배포는 Deno Deploy

## 왜 Fresh인가

Deno에서 바로 돌아가고, 빌드 결과물이 가볍다. Island가 필요 없으면 JS 0KB
블로그도 가능하다.

## 앞으로 할 일

1. `_app.tsx` 레이아웃 다듬기
2. 태그 페이지, RSS 추가
3. Deno Deploy 연결
4. 글 쓰기

```ts
// posts/*.md 쓰면 끝
await getPosts();
```
