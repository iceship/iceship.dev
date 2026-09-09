---
title: "TypeScript, Node.js 프로젝트 초기화"
date: "2025-12-03"
tags: ["typescript", "nodejs", "pnpm"]
summary: "기억하기보다 적어두는 TypeScript + Node.js 기본 프로젝트 초기화 가이드"
---

![TypeScript Node.js Init](/images/blog/typescript-node.js-init-1764724377719.webp)

## TypeScript + Node.js Init

기억하기보다 적어두는 초기화

```bash
pnpm init
pnpm i -D @types/node typescript
pnpm tsc --init
```

### tsconfig.json

```json
{
  "types": ["node"]
}
```

### package.json

```json
{
  "type": "module"
}
```

### 실행

```bash
node index.ts
```
