---
title: "10만 토큰 루프에서 190ms 멱등성까지: Pi Agent와 TypeSafe Jev로 구축한 Shopify ↔ POS 카탈로그 동기화 파이프라인"
date: "2026-09-21"
tags: ["ai", "pi-agent", "typesafe", "jev", "shopify", "pos", "deno", "drizzle", "postgresql", "idempotency"]
summary: "터미널 코딩 에이전트에게 동기화 기능을 맡겼다가 컨텍스트가 10만 토큰까지 치솟았다. 무거운 Docker를 치우고 DB 직결로 테스트 주기를 190ms로 줄인 뒤, 좁은 마이크로 스펙과 500ms 비-자기회귀 의사결정 모델 Jev를 게이트로 세워 멱등한 카탈로그 파이프라인을 완성한 기록."
---

코딩 에이전트를 터미널에서 돌려본 개발자라면 누구나 컨텍스트가 끝없이 팽창하며 터미널 로그가 멈추지 않는 상황을 마주해본 적이 있을 것이다.

작업을 맡겨두고 잠시 자리를 비웠다 돌아왔을 때, 터미널 화면에는 끝없는 마이그레이션 재시도 로그가 찍히고 있었다:

```text
[Pi Agent] Running test suite... (attempt 14)
[Pi Agent] [Diff] Schema column order mismatch! Re-generating migrations...
[Pi Agent] Starting Docker container... (waiting 30s)
[Pi Agent] Stopping Docker container...
[Pi Agent] Re-generating migrations... (attempt 15)
Tokens: 101,986 / Context limit approaching...
```

급히 프로세스를 중단했지만 이미 컨텍스트는 **10만 토큰**을 넘어섰고, 세션 로그 파일은 **487KB**에 달했다.  
에이전트는 원래 목표였던 동기화 로직 대신, Drizzle ORM의 컬럼 순서 diff를 잡겠다며 마이그레이션 파일을 지우고 다시 만드는 루프에 갇혀 있었다.

온라인 쇼핑몰(Shopify)과 오프라인 POS 단말기 사이에서 상품, 다중 옵션(Variant), 할인 전 정가(compare-at price), 공급원가(cost)를 오차 없이 **멱등(Idempotent)하게 동기화**하는 기능을 만들면서 겪은 문제와, 이를 마이크로 스펙과 비-자기회귀 의사결정 모델(TypeSafe Jev)로 해결한 과정을 정리한다.

---

## 10만 토큰이 타버린 이유

목표는 Shopify 클라우드의 상품 데이터를 매장 POS 로컬 DB로 가져오는 파이프라인 구축이었다.  
요구사항 자체는 전형적이었다:

- **가격 필드의 다변화**: 판매가(`price`), 세일 전 정가(`compare_at_price`), 그리고 매장 내부 관리용인 공급원가(`cost`)를 분리해서 관리한다.
- **다중 옵션과 바코드**: 상품별로 여러 Variant가 존재하며, 각 Variant마다 고유 SKU와 바코드를 가진다.
- **엄격한 멱등성 (Idempotency)**: 동일한 웹훅이나 스냅샷이 여러 번 유입되어도 중복 레코드가 생기지 않아야 하며, 변경 사항이 없다면 DB 쓰기(`write`)가 정확히 0건이어야 한다.

하지만 처음 작업에서 에이전트에게 "Shopify 카탈로그 및 가격 동기화 기능을 구현해달라"는 넓은 범위의 지시를 내렸고, 여러 문제가 겹치며 실패했다.

가장 큰 병목은 느린 테스트 환경이었다. 테스트 스크립트가 매 실행마다 로컬 Docker PostgreSQL 컨테이너를 가동하고 종료했다. 1회 테스트 주기가 30~40초씩 걸리다 보니, 에이전트가 서너 번만 오류를 수정해도 수분이 소모되고 세션 컨텍스트가 빠르게 누적되었다.

여기에 Drizzle ORM의 컬럼 정렬 순서 불일치가 겹쳤다. `ALTER TABLE ... ADD COLUMN`으로 테이블에 `cost_amount_minor`를 추가하면 PostgreSQL은 이를 테이블 맨 뒤에 물리적으로 배치한다. 반면 Drizzle ORM의 스키마 정의는 TypeScript 선언 순서대로 컬럼을 파싱한다. `schema_parity` 테스트에서 이 순서 차이로 인한 diff가 발생하자, 에이전트는 이를 심각한 에러로 인식하고 마이그레이션을 계속 다시 생성했다.

도메인 모델링, DB 마이그레이션, 외부 참조 매핑, 가격 계산, API 보안 불변식을 한 번에 지시한 탓에 에이전트의 작업 문맥이 지나치게 복잡해진 것도 원인이었다.

---

## 매 테스트마다 40초: Docker부터 치웠다

문제를 해결하기 위해 가장 먼저 테스트 환경의 병목을 걷어냈다.

컨테이너 기동/종료 방식 대신, 홈랩 인프라의 전용 Linux 컨테이너(LXC 클러스터 `10.200.x.x:5432`)에 독립된 개발 DB(`pos_dev`)와 테스트 DB(`pos_test`)를 마련했다.  
테스트 실행 시에는 `DROP SCHEMA IF EXISTS ... CASCADE`를 통해 수 밀리초 만에 스키마를 초기화하도록 구성했다.

```text
[Before: Docker Container Loop]
수정 -> 도커 기동(20s) -> 마이그레이션 -> 테스트 -> 도커 중지(10s) -> 1사이클 40초

[After: LXC 전용 PostgreSQL 클러스터 직결]
수정 -> Deno Test 직결 실행 -> 마이그레이션 & 테스트 완료 -> 1사이클 190ms
```

피드백 루프가 40초에서 **0.2초 미만**으로 단축되면서 에이전트가 변경 사항을 즉시 검증할 수 있는 환경이 갖춰졌다.

---

## 삼각 편대: 함수 하나, 테스트 하나, 500ms 판관

환경을 바꾼 뒤 작업 진행 방식도 전면 수정했다.  
에이전트에게 전체 기능을 맡기는 대신, "함수 1개 + 단위 테스트 1개" 수준의 마이크로 스텝으로 작업을 쪼개고 단계마다 판정 모델을 통과하도록 했다.

```text
       [ Antigravity ]
       (총괄 오케스트레이터)
         │
         │ 1. 단일 함수/인터페이스 수준의 마이크로 스펙 전달
         ▼
       [ Pi Agent ] (PI_TYPESAFE_ENABLED=1)
       (백그라운드 구현 에이전트)
         │
         │ 2. 구현 후 deno test로 자가 검증
         ▼
       [ TypeSafe Jev ] (v1.13.0)
       (비-자기회귀 의사결정 모델)
         │
         │ 3. 500ms 내 확률(Noul/Score) 기반 게이트 판정
         ▼
  ┌──────┴────────────────────────┐
  │ Pass (noul > 0.6)             │ Reject (noul < 0.4)
  ▼                               ▼
다음 마이크로 스텝 진행             원인 분석 및 격리 수정
```

이 구조에서 에이전트는 작성한 코드의 테스트 통과 여부만 보고하고, 다음 단계 진행 여부는 비-자기회귀 의사결정 모델인 TypeSafe Jev의 점수로 결정한다.

---

## 센트 연산과 계약 스키마의 빈틈

작업 단위를 좁히자 에이전트가 각 모듈의 엣지 케이스를 정확하게 처리하기 시작했다.

Shopify는 가격을 `"19.99"` 같은 소수점 문자열로 반환한다. 자바스크립트에서 이를 `Number("19.99") * 100`으로 연산하면 부동소수점 한계로 인해 `1998.9999999999998`이 되어 1센트 오차가 발생할 수 있다.

마이크로 스텝 2A(`parseShopifyMoneyMinor`)에서는 곱셈 대신 문자열 분할과 정수 연산을 사용하도록 지시했다:

```typescript
// apps/pos-api/src/catalog/shopify_transform.ts
export function parseShopifyMoneyMinor(value: string | number | null | undefined): number | null {
  const s = (typeof value === "number" ? String(value) : value ?? "").trim();
  if (!s) return null;
  const [whole, frac = ""] = s.split(".");
  if (!/^\d+$/.test(whole) || !/^\d{0,2}$/.test(frac)) return null;
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2) || 0);
}
```

문자열 슬라이싱으로 센트 자릿수를 맞춘 뒤 정수로 조합해 부동소수점 오차를 방지했다. TypeSafe Jev 평가 점수는 **`score = 2.06 / 3.0` (Correct 88%)**으로 통과했다.

계약 스키마와의 충돌도 처리해야 했다. 단위 2B(`transformShopifyProduct`)에서는 `@packages/contracts`의 Zod 스키마를 통과해야 했는데, 외부 시스템 버전 필드인 `source_version`의 스키마 제약이 `/^\d+$/`(숫자 전용)로 선언되어 있었다. 반면 Shopify의 `updated_at`은 ISO 타임스탬프(`"2025-06-01T10:00:00.000Z"`)였다.

에이전트는 정규식을 우회하는 대신 타임스탬프에서 숫자만 추출해 정렬 순서를 유지하도록 처리했다:

```typescript
function sourceVersion(value: string | null | undefined): string | null {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits === "" ? null : digits;
}
```

---

## noul = 0.31: 단위 테스트 초록불을 의심하라

가장 유효했던 순간은 **Unit 2C** 단계였다.

여러 상품을 단일 스냅샷으로 묶는 `transformShopifyCatalog` 함수를 작성하고, 6개의 단위 테스트가 4ms 만에 통과했다. 솔직히 이때는 나 역시 '단위 테스트가 다 돌았으니 다음 기능으로 넘어가도 되겠다'고 생각했다.

하지만 TypeSafe Jev를 통해 현재 구현 상태가 실제 DB 연동으로 넘어가기에 충분한지 질의했다:

```json
{
  "question": "Is transformShopifyCatalog ready to be tested end-to-end against the live database?",
  "type": "noul"
}
```

0.5초 만에 날아온 Jev의 응답:

```json
{
  "ready_for_unit_2d": {
    "type": "noul",
    "noul": 0.31
  }
}
```

**`noul = 0.31`**이 나왔다.  
메모리 상에서 객체를 병합하는 단위 테스트만으로는 실제 PostgreSQL 테이블의 외래키 제약과 멱등성 검증이 불완전하다는 판단이었다. 모델의 거부 신호 덕분에 안도감을 접고 실제 DB를 때리는 통합 테스트(`catalog_shopify_sync_test.ts`)를 작성했다.

1. **1단계 (초기 동기화)**: 상품 2개(변형 3개, 가격 3개, 바코드 2개)를 입력하여 DB row 생성을 확인.
2. **2단계 (재동기화 검증)**: 동일 데이터를 재전송하되, 변환기가 매번 새로운 UUID를 생성하도록 설정.  
   DB의 `externalReferences` 테이블을 조회해 기존 내부 ID로 정상 매핑되는지 검증:
   ```typescript
   assertEquals(res2, {
     createdProducts: 0, updatedProducts: 0,
     createdVariants: 0, updatedVariants: 0,
     createdPrices: 0, updatedPrices: 0,
     unchangedCount: 10, // 상품 2 + 옵션 3 + 가격 3 + 바코드 2
   });
   ```
   **결과: 0 writes, 10 unchanged.**
3. **3단계 (부분 업데이트)**: 원가와 판가를 변경했을 때 해당 row만 `version: 2`로 갱신되는지 확인.

통합 테스트가 105ms 만에 완료된 후 Jev 평가를 다시 진행했고, **`score = 2.05 (Robust E2E 95%)`**를 얻어 다음 단계로 진행할 수 있었다.

---

## 키오스크 화면에 원가가 새어나가지 않게

마지막 점검 항목은 키오스크 클라이언트 보안이었다.

DB의 `variants` 테이블에는 내부 마진 분석용으로 `cost_amount_minor`(공급원가) 컬럼이 추가되었다. 하지만 이 값은 POS 키오스크 화면이나 고객용 영수증 출력 API에 노출되어서는 안 된다.

카탈로그 리더(`reader.ts`)의 쿼리 매핑을 점검하여 원가 필드가 격리되어 있는지 확인했다:

```typescript
// apps/pos-api/src/catalog/reader.ts
return posCatalogProductSchema.parse({
  ...product,
  variants: variants.map((v) => ({
    id: v.id,
    name: v.name,
    sku: v.sku,
    price: price ? {
      amount_minor: price.amountMinor,
      compare_at_amount_minor: price.compareAtAmountMinor ?? null, // 정가는 노출
      currency: price.currency,
      tax_code: price.taxCode,
      tax_inclusive: price.taxInclusive,
    } : null,
    // cost_amount_minor는 매핑 대상에서 제외
  })),
});
```

개발 DB(`pos_dev`)에서 psql을 통해 실제 저장 상태도 확인했다:

```text
$ psql -h 10.200.x.x -U shop_pos_admin -d pos_dev -c "SELECT p.name, v.name as variant, v.cost_amount_minor, pr.amount_minor, pr.compare_at_amount_minor, c.raw_value FROM pos_catalog.products p ...;"

     name      | variant | cost_amount_minor | amount_minor | compare_at_amount_minor |    barcode    
---------------+---------+-------------------+--------------+-------------------------+---------------
 Lumora Hoodie | L       |              3850 |        12900 |                   14900 | 9300000000028
 Lumora Hoodie | M       |              3850 |        12900 |                   14900 | 9300000000011
 Lumora Mug    | Default |               610 |         2499 |                    2999 | 9300000000059
 Lumora Tee    | S       |               820 |         3900 |                         | 9300000000035
(4 rows)
```

DB에는 원가와 정가가 모두 저장되지만, 키오스크 API 계약(`posCatalogProductSchema`)을 통해 외부로는 판매가와 정가만 전달된다. 동일 데이터를 다시 동기화했을 때 `unchangedCount: 20`이 반환되며 0건의 불필요한 쓰기가 유지되었다.

---

## 에이전트의 속도는 피드백 주기가 결정한다

이번 작업을 거치면서 코딩 에이전트에 대해 느낀 점은 꽤 구체적이다.

AI 에이전트는 일을 못하는 게 아니다. 오히려 타이핑 속도와 패턴 인식은 인간 개발자보다 빠르다. 문제는 **자기가 어디서 헤매고 있는지 스스로 인지하지 못한다는 점**이다. Docker 띄우느라 30초씩 까먹는 환경에 에이전트를 방치해두면, Drizzle 컬럼 순서 같은 사소한 diff 하나를 붙잡고 마이그레이션을 지웠다 만들었다 하면서 10만 토큰을 금방 소진한다.

결국 사람이 해줘야 할 일은 세 가지로 수렴했다.

첫째, 테스트 피드백을 200ms 안으로 줄여 에이전트가 변경 결과를 즉각 알 수 있게 하는 것.  
둘째, 지시 단위를 '함수 하나 + 테스트 하나'로 좁혀 컨텍스트가 흐트러지지 않게 하는 것.  
셋째, 에이전트의 자체 보고 대신 비-자기회귀 모델(Jev)이나 자동화된 E2E 멱등성 테스트처럼 감정이 섞이지 않은 검증대를 중간에 세우는 것.

에이전트의 속도를 살리는 핵심은 화려한 프롬프트가 아니라 빠른 피드백 주기와 명확한 판정 기준에 있다.
