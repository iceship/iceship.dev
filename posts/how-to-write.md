---
title: "마크다운으로 글 쓰는 법"
date: "2026-09-07"
tags: ["blog"]
summary: "posts 폴더에 md 파일 하나 만들면 글이 된다"
---

# 마크다운으로 글 쓰는 법

`posts/내-글-slug.md` 파일을 만들면 `/blog/내-글-slug`로 바로 보인다.

## front-matter 규칙

```md
---
title: "제목"
date: "2026-09-07"
tags: ["deno"]
summary: "목록에 보이는 한 줄 요약"
---
```

- `slug` = 파일명 (영문, 하이픈 권장)
- `date` = `YYYY-MM-DD`
- 본문은 GitHub Flavored Markdown

## 다음 글 아이디어

- Deno Deploy 연결 후기
- Fresh 2에서 RSS 만드는 법
