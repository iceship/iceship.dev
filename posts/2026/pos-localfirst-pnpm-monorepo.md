---
title: "소매점 POS를 로컬-퍼스트로: PowerSync + Deno/Hono, 그리고 pnpm 모노레포 전환기"
date: "2026-09-12"
tags: ["pos", "powersync", "deno", "hono", "vue", "pnpm", "monorepo", "offline-first", "stripe"]
summary: "30,000 SKU 오프라인 카탈로그를 지원하는 Vite+Vue PWA 클라이언트와 Deno+Hono 동기화 허브 구축기. HID 바코드 가로채기, Stripe Terminal 서버 주도 결제, ATO GST 영수증, 오프라인 트랜잭셔널 아웃박스 패턴부터 Deno와 pnpm 심링크 충돌 해결까지 정리했습니다."
---

소매점 매장 현장에서 운영되는 키오스크 POS 시스템을 **로컬-퍼스트(Local-first / Offline-first)** 아키텍처로 처음부터 끝까지 구축했습니다.

요구 조건은 실무 리테일 환경답게 꽤 까다로웠습니다:
- **30,000 SKU 대량 상품 카탈로그**: 오프라인 상태에서도 전 품목 즉시 검색
- **5ms 미만 바코드 조회**: 하드웨어 스캐너 입력 시 딜레이 없는 실시간 상품 매칭
- **100% 오프라인 현금 판매 & ACID 트랜잭션**: 인터넷이 끊겨도 현금 결제와 재고 차감이 원자적으로 보장
- **Stripe Terminal 스마트 결제**: 무선 카드 단말기(WisePOS E) 서버 주도 결제 파이프라인
- **호주 국세청(ATO) 규격 영수증**: GST(부가가치세) 계산, ePOS-XML 프린터 출력 및 RJ11 현금 서랍 킥 펄스 연동

클라이언트는 순수 SPA 기반의 **Vite + Vue 3 PWA**, 백엔드는 **Deno + Hono** 기반의 경량 동기화 허브로 구성했습니다. 그리고 마지막으로 프론트엔드와 백엔드를 **pnpm 모노레포**로 통합했습니다.

이 과정에서 **"코드를 다 짰다"고 생각했던 시점에 실제 타입체크와 빌드 검증을 돌리며 발견한 5건의 실전 버그와 Deno의 pnpm 심링크 충돌 트러블슈팅**을 상세히 기록합니다.

---

## 1. 아키텍처: 왜 로컬-퍼스트인가?

현장 리테일 매장에서 네트워크 연결은 **"있으면 좋은 보조 수단"**이지, 계산을 가로막는 **"필수 전제 조건"**이 되어서는 안 됩니다. 매장 Wi-Fi가 일시적으로 끊기거나 통신사 장애가 발생해도 손님의 결제와 영수증 발행은 중단 없이 이어져야 합니다.

이를 만족하기 위해 다음과 같이 3계층 로컬-퍼스트 아키텍처를 설계했습니다:

```text
┌──────────────────────────────────────────────────────────────┐
│  Kiosk Client (apps/client · Vite + Vue 3 PWA)               │
│  - OPFS Web Worker (SQLite + FTS5 Full-text Search)          │
│  - PowerSync Local Cache (30,000 SKU 카탈로그 보유)          │
│  - Local Transaction: orders + order_items + sync_outbox     │
└──────────────────────────────┬───────────────────────────────┘
                               │ 오프라인 아웃박스 동기화 (REST Batch)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  Sync & Payment Hub (apps/server · Deno + Hono)              │
│  - POST /api/sync/orders (UUIDv7 기반 409 Deduped 멱등성)     │
│  - POST /api/checkout/stripe-terminal (Server-driven 결제)   │
│  - PostgreSQL (중앙 재고 원장 + 트랜잭셔널 아웃박스)         │
└──────────────────────────────────────────────────────────────┘
                               ▲
                               │ 단일 진실 공급원 (SSOT) 공유
┌──────────────────────────────┴───────────────────────────────┐
│  Shared Contracts (packages/shared · @pos/shared)            │
│  - DTO 타입: CheckoutTerminalRequest, SyncOrderRequest       │
│  - ATO 규정 GST 계산 유틸리티, 공통 에러 스키마              │
└──────────────────────────────────────────────────────────────┘
```

- **클라이언트 (`apps/client`)**:
  - Vite + Vue 3 + TypeScript + Tailwind CSS + Pinia 조합의 순수 SPA PWA입니다.
  - PowerSync(`@powersync/web`, `@powersync/vue`)를 사용해 브라우저 OPFS(Origin Private File System) 워커 위의 SQLite에 30,000개 상품 카탈로그를 통째로 보관합니다.
  - 상품명 검색은 SQLite FTS5 가상 테이블을 활용해 로컬에서 즉시 수행하고, 바코드 스캔은 B-Tree 인덱스로 5ms 미만에 정확히 매칭합니다.
- **서버 (`apps/server`)**:
  - Deno + Hono 기반의 초경량 동기화 및 결제 허브입니다.
  - PostgreSQL 앞단에서 오프라인 큐 동기화와 Stripe Terminal 결제 위임만을 담당하며, 엔드포인트는 단 3개(`POST /api/sync/orders`, `POST /api/checkout/stripe-terminal`, 웹훅)와 health 체크로 최소화했습니다.
- **공유 계약 (`packages/shared`)**:
  - 클라이언트와 서버가 주고받는 API 페이로드 타입과 세금 계산 헬퍼의 단일 진실 공급원(SSOT)입니다.

---

## 2. 실전 도메인 규칙 4가지와 구현 패턴

실제 오프라인 리테일 환경을 지탱하는 4가지 핵심 도메인 규칙을 코드로 녹여냈습니다.

### A. 하드웨어 바코드 스캐너 인터셉트 (HID Keyboard Wedge)

현장의 바코드 스캐너는 대부분 USB나 블루투스로 연결되는 **HID 키보드 장치**로 인식됩니다. 사용자가 검색 입력창에 포커스를 맞추지 않아도 어디서든 바코드를 인식할 수 있어야 합니다.

- 전역 `window.addEventListener('keydown')`으로 키 입력을 가로챕니다.
- 스캐너는 사람이 칠 수 없는 빠른 속도로 문자열을 쏟아냅니다. 따라서 **키 입력 간격 40ms 미만**, **최소 8자 이상**, **Enter 키 종결** 조건을 만족할 때만 바코드 스캔으로 판정합니다.
- 사람이 타이핑할 때는 키 간격이 벌어지므로 내부 버퍼가 자연스럽게 리셋되어 오작동을 방지합니다.

이 로직을 `useBarcodeScanner` 컴포저블 하나로 캡슐화하여 모든 화면에서 투명하게 동작하도록 구현했습니다.

### B. Stripe Terminal 서버-주도(Server-driven) 결제

키오스크 단말이 카드 정보를 직접 다루지 않고, 보안이 보장된 서버 주도 방식으로 결제를 제어합니다.

1. 키오스크가 `POST /api/checkout/stripe-terminal`로 `{ order_id, total_cents, reader_id }`를 서버에 전송합니다.
2. Deno 서버가 Stripe API를 호출해 AUD 통화 기반 `PaymentIntent`를 생성하고, 카운터의 WisePOS E 무선 단말기로 결제 명령을 Push합니다.
3. 손님이 카드를 탭(Tap to Pay)하면 결제가 승인되고, Stripe 서버가 백엔드로 `terminal.reader.action_succeeded` 웹훅을 발송합니다.
4. Deno 서버는 웹훅 서명을 검증할 때 외부 라이브러리나 무거운 Node crypto 의존성 없이, Deno 네이티브인 `constructEventAsync`와 Web Crypto(`SubtleCrypto`) API를 사용하여 빠르고 안전하게 검증합니다.

### C. 호주 국세청(ATO) 규격 GST 및 영수증/금고 제어

호주 리테일에서는 모든 소비자가격이 **GST(Goods and Services Tax, 10%) 포함가**로 표기되어야 합니다.

- **GST 산출 공식**: `과세 상품 총액 ÷ 11`
- 면세 대상 품목(`gst_applicable = 0`)은 계산에서 제외하고, 영수증 하단에는 ATO 필수 법적 문구인 `Total includes GST of $X.XX`를 명시합니다.
- 영수증 출력은 Epson ePOS-XML 프로토콜을 통해 네트워크 영수증 프린터 IP로 직접 `fetch` POST를 수행합니다.
- 현금 결제 완료 시에는 프린터를 거쳐 금고(Cash Drawer)로 RJ11 킥 펄스 제어 코드(`\x1B\x70\x00\x19\xFA`)를 전송해 금고 서랍을 자동으로 열어줍니다.

### D. 오프라인 트랜잭셔널 아웃박스 (Transactional Outbox)

이번 설계에서 가장 견고하게 구축한 동기화 파이프라인입니다. 오프라인 상태에서 네트워크 요청이 실패하더라도 주문 데이터는 절대 유실되면 안 됩니다.

```text
[주문 완료]
   │
   ▼
[Local SQLite 단일 ACID 트랜잭션]
   ├── orders 테이블 기록
   ├── order_items 테이블 기록
   └── sync_outbox 테이블 기록 (UUIDv7 idempotency_key 포함)
   │
   ▼
[동기화 워커 (Online 감지 시 백그라운드 발송)]
   │
   ├── 20건씩 배치로 POST /api/sync/orders 전송
   │
   ├── [200 OK]: 로컬 outbox에서 성공 항목 삭제
   ├── [409 Conflict]: 서버에서 이미 처리된 중복 주문(Deduped) ➔ 정상 처리로 간주하고 로컬 outbox 삭제
   ├── [4xx Client Error]: 데이터 오염(Poison Message) ➔ 큐 영구 막힘 방지를 위해 격리/제거
   └── [5xx / Network Error]: 지수 백오프로 재시도 (Exponential Backoff)
```

서버 측 데이터베이스에는 `idempotency_key`에 `UNIQUE` 제약 조건을 걸어두어, 일시적 네트워크 재연결로 동일한 주문 배치가 두 번 전송되더라도 **409 Conflict**로 흡수하여 멱등성(Idempotency)을 완벽하게 보장했습니다.

또한 하드웨어가 없는 로컬 개발 환경에서도 모든 흐름을 테스트할 수 있도록 Mocking 모드를 구축했습니다. 영수증 프린터 IP 미지정 시 브라우저 콘솔로 가상 영수증을 출력하고, `checkoutStripe('mock')` 호출 시 가상 결제 인텐트를 생성하여 하드웨어 없이도 전체 플로우를 검증할 수 있습니다.

---

## 3. 타입체크와 빌드가 잡아낸 5가지 실전 버그

기능 구현을 마쳤을 때는 "모든 요구사항을 다 작성했으니 끝났다"고 생각했습니다. 하지만 실제 설치된 라이브러리 버전을 기준으로 **엄격한 타입체크(`vue-tsc`, `deno check`)와 프로덕션 빌드(`vite build`)를 실행하자마자 숨어 있던 5가지 버그가 터져 나왔습니다.**

문서나 AI 학습 데이터의 기억에 의존하지 않고, 실제 빌드 검증을 통해 해결한 내역입니다.

### ① 존재하지 않는 export 참조 (PowerSync v2 마이그레이션)
- **증상**: `import { WASQLitePowerSyncDatabaseOpenFactory } from '@powersync/web'`에서 모듈을 찾을 수 없다는 에러 발생.
- **원인**: 이전 버전 문서나 학습 데이터에 남아 있던 클래스명이 최신 PowerSync Web v2에서 완전히 변경되었습니다.
- **해결**: `node_modules` 내부의 `.d.ts` 파일과 공식 릴리스 노트를 직접 확인하여, `database: { dbFilename, vfs: OPFSCoopSyncVFS }` 구조의 최신 팩토리 옵션으로 교체했습니다.

### ② SQLite 컬럼의 Nullability 불일치
- **증상**: `price_cents` 등 숫자형 컬럼을 장바구니 계산 로직에 넘길 때 `Type 'number | null' is not assignable to type 'number'` 발생.
- **원인**: PowerSync의 스키마 생성기가 SQLite 컬럼을 기본적으로 `nullable`(`number | null`)로 추론하기 때문이었습니다.
- **해결**: 스키마 단에서 `column.text` / `column.integer`의 널 제약을 점검하고, `cart.ts`와 `App.vue` 계층에서 `item.price_cents ?? 0` 형태로 안전한 널 병합 폴백을 적용했습니다.

### ③ 비동기 스캐너 콜백의 반환 타입 불일치
- **증상**: 스캐너 콜백 함수 시그니처에서 `Promise<boolean>`과 `Promise<void>` 간의 불일치 경고 발생.
- **해결**: 스캐너 감지 핸들러의 반환형을 명시적으로 `void`로 래핑하여 이벤트 처리 흐름을 정돈했습니다.

### ④ Vite 워커 빌드 오류 (`Invalid value "iife" for output.format`)
- **증상**: `pnpm build` 실행 시 PowerSync 내부 웹 워커 번들링 단계에서 `Invalid value "iife"` 에러가 발생하며 빌드 중단.
- **원인**: Vite의 기본 코드 스플리팅 환경에서 Web Worker 스크립트를 즉시 실행 함수(IIFE)로 묶으려다 충돌이 발생한 것이었습니다.
- **해결**: `vite.config.ts`에 워커 번들 포맷을 ES 모듈로 지정하고 사전 번들링 제외 설정을 추가하여 해결했습니다.
  ```typescript
  export default defineConfig({
    worker: {
      format: "es",
    },
    optimizeDeps: {
      exclude: ["@powersync/web"],
    },
  });
  ```
  설정 적용 후 34개의 정적 에셋 및 오프라인 precache 엔트리가 정상 빌드되었습니다.

### ⑤ Deno와 pnpm의 심링크 충돌 (오늘의 하이라이트)
아래 섹션에서 상세히 다룹니다.

---

## 4. 깊은 함정: `nodeModulesDir: auto`와 pnpm의 공존 불가 문제

4번 워커 빌드 문제를 해결한 직후, 갑자기 클라이언트 빌드가 다시 깨지는 기현상이 발생했습니다.

원인을 파고들어 루트 디렉터리의 `node_modules/@powersync` 심링크를 확인해 보니 경악스러운 상태였습니다:

```text
# 정상적인 pnpm 심링크 상태
node_modules/@powersync -> ../.pnpm/@powersync+web@.../node_modules/@powersync

# Deno 실행 후 오염된 심링크 상태
node_modules/@powersync -> ../node_modules/.deno/@powersync+web@.../node_modules/@powersync
```

심링크가 pnpm 스토어(`.pnpm`)가 아니라 **`node_modules/.deno/` 디렉터리를 가리키고 있었습니다.**

### 원인 분석
Deno 백엔드를 테스트하기 위해 `deno check`나 서버 실행 명령을 돌리는 순간, 루트 `deno.json`에 설정되어 있던 `"nodeModulesDir": "auto"` 옵션이 발동했습니다.

Deno는 프로젝트 내의 npm 패키지를 해석하면서 pnpm이 구성해 둔 가상 스토어 심링크들을 무시하고, **Deno 자체 npm 캐시(`.deno/`) 레이아웃으로 심링크를 통째로 덮어써 버린 것**입니다. Deno가 재구성한 디렉터리 구조는 Vite와 Rollup이 기대하는 pnpm 심링크 구조와 달라 프론트엔드 빌드가 즉시 터지게 되었습니다.

### 해결책
루트 `deno.json`에 다음과 같이 명시적인 격리 옵션을 지정했습니다:

```json
{
  "workspace": ["apps/server"],
  // "none": Deno가 npm/jsr 의존성을 전역 캐시로만 해석하고,
  // pnpm이 관리하는 node_modules 및 심링크에 일절 손대지 않도록 완벽 격리합니다.
  "nodeModulesDir": "none"
}
```

오염된 `.deno` 잔재를 삭제하고 `pnpm install`로 심링크를 복원한 뒤, Vite 빌드와 `deno check` 양쪽 모두 완벽하게 통과했습니다.

> [!IMPORTANT]
> **Deno 워크스페이스와 pnpm 워크스페이스를 한 모노레포에 공존시킬 때는 반드시 루트 `deno.json`에 `"nodeModulesDir": "none"`을 지정해야 합니다.** 그렇지 않으면 Deno가 pnpm의 심링크를 덮어써 프론트엔드 빌드를 망가뜨립니다.

---

## 5. pnpm 모노레포 전환으로 얻은 이점

프로젝트를 `apps/client`, `apps/server`, `packages/shared` 구조로 분리하고 pnpm 모노레포로 묶었습니다.

가장 큰 수확은 **`@pos/shared` 패키지를 통한 타입 계약(API Contract)의 일원화**입니다:

- 기존에는 `CheckoutTerminalRequest`, `SyncOrderRequest` 같은 요청/응답 페이로드 타입이 클라이언트와 서버 양쪽에 각각 인라인으로 중복 정의되어 있었습니다.
- 이를 `@pos/shared` 패키지로 모으고:
  - **Vue 클라이언트**: `package.json`의 `workspace:*` 의존성으로 타입 참조
  - **Deno 서버**: `deno.json`의 import map(`"@pos/shared": "../../packages/shared/src/index.ts"`)으로 직접 참조
- 이제 백엔드 DTO가 변경되거나 세금 계산 로직이 수정되었을 때 컴파일 타임에 즉시 감지되므로, **클라이언트와 서버 간의 API 계약 불일치(API Drift)가 구조적으로 불가능**해졌습니다.

루트 `package.json`의 실행 스크립트도 간결하게 위임되었습니다:
```bash
pnpm dev           # 클라이언트 개발 서버 (Vite HMR)
pnpm build         # PWA 및 OPFS 워커 에셋 빌드
pnpm server:dev    # Deno Hono 서버 개발 모드 (watch)
pnpm server:start  # Deno 서버 프로덕션 시작
```

---

## 6. 마치며: 완성의 정의

이번 POS 구축 작업을 통해 다시 한번 깊게 새긴 엔지니어링 원칙이 있습니다:

> **"코드를 다 작성했다"는 것은 완성이 아닙니다. "실제 환경에서 엄격한 타입체크와 프로덕션 빌드가 에러 없이 통과했다"가 진정한 완성의 정의입니다.**

특히 오프라인 퍼스트(PowerSync v2)처럼 라이브러리 생태계가 빠르게 변화하는 기술을 다룰 때는, 기억이나 오래된 튜토리얼을 맹신하지 말고 `node_modules` 내부의 실제 `.d.ts` 타입 정의를 직접 확인하는 습관이 디버깅 시간을 몇 시간씩 단축해 준다는 점을 확인했습니다.

여기에 Deno 백엔드와 pnpm 프론트엔드를 한 지붕 아래 묶을 때 `"nodeModulesDir": "none"` 격리 규칙까지 정립했으니, 앞으로 오프라인 리테일 프로젝트를 확장해 나갈 든든한 초석이 마련된 셈입니다.

