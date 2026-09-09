---
title: "Lightspeed POS 매트릭스 상품의 한계를 극복한 실시간 고화질 이미지 & 설명 동기화 파이프라인 구축기"
date: "2026-09-07"
tags: ["deno", "lightspeed", "ecommerce", "web-scraping", "nuxt", "hono"]
summary: "Lightspeed POS의 Matrix Variant Child 이미지 업로드 제한(400 에러)과 공급사 SKU 오매칭 문제를 해결하고, 초고화질 무손실 이미지와 시맨틱 설명을 자동 동기화한 트러블슈팅 기록"
---

# Lightspeed POS 매트릭스 상품의 한계를 극복한 실시간 고화질 이미지 & 설명 동기화 파이프라인 구축기

옴니채널 리테일 플랫폼(Lightspeed Retail POS ↔ Shopify)을 운영하다 보면, 새로
입고된 구매 발주서(Purchase Order)의 상품 카탈로그 관리가 가장 번거로운 작업 중
하나입니다.

POS 시스템에 수십 종의 상품이 새로 등록되었지만 **대표 이미지도 없고, 상품
설명(Description)도 텅 비어 있는 경우**가 빈번합니다. 매장 직원이 일일이 공급사
사이트에 들어가 이미지를 다운로드받고 POS에 올리는 작업은 엄청난 시간
낭비입니다.

이를 해결하기 위해 발주서 상세 관제 화면에서 **버튼 한 번(1-Click "Fetch Image
All")으로 공급사 사이트에서 고화질 원본 갤러리 이미지와 상세 설명을 자동으로
긁어와 Lightspeed POS에 채워 넣는 파이프라인**을 구축했습니다.

하지만 실제 구현 과정에서 이기종 시스템 간의 미묘한 도메인 제약 조건과 부딪히며
여러 트러블슈팅을 거쳤습니다. 오늘 겪었던 핵심 문제와 해결 과정을 기록으로
남깁니다.

---

## 1. 첫 번째 난관: Lightspeed POS의 매트릭스(Matrix) 제약과 400 Bad Request

가장 먼저 맞닥뜨린 문제는 일부 품목(Dopener, Clongs Lite, Upcup 등)에 대해
이미지 업로드를 요청할 때 서버에서 `500 Internal Server Error`가 반환되는
현상이었습니다.

백엔드(Deno + Hono) 로그를 직접 열어보니 범인은 Lightspeed API였습니다.

```json
{
  "errors": {
    "global": ["Cannot upload product image on a variant child"]
  }
}
```

### 원인 분석

- 발주서(PO) 라인아이템에 기록된 `productId`는 실제 매장에 입고되는 **세부 옵션
  품목(Variant Child, 예: Big Upcup-2 Cup)**의 ID였습니다.
- 하지만 Lightspeed POS의 아키텍처상, **옵션 자식 상품에는 이미지를 직접
  업로드할 수 없습니다.**
- 이미지는 반드시 **부모 매트릭스 상품(Parent Matrix Product)**에 업로드되어야
  하며, 부모 상품에 등록된 갤러리 이미지가 모든 자식 품목에 공통으로 상속 및
  표시되는 구조였습니다.

### 해결책: 부모 Matrix 상품 자동 승격 (Parent Promotion) 패턴

클라이언트나 호출자가 해당 상품이 단독 상품인지 자식 품목인지 일일이 알 필요가
없도록, 워커 서버(`upload-image`) 레이어에서 자동 승격 로직을 구현했습니다.

```typescript
// 1. 대상 상품이 Variant Child인지 사전 검사
const lsProd = await fetchLightspeed(`products/${productId}`);
const pData = lsProd.data || lsProd;

// variant_parent_id가 존재하면 업로드 대상을 부모 Matrix ID로 자동 승격!
let targetProductId = pData?.variant_parent_id || productId;

if (pData?.variant_parent_id) {
  console.log(
    `[Upload Image] Product ${productId} is a variant child. Directing upload to parent ${targetProductId}...`,
  );
}

// 2. 부모 Matrix 상품에 초고화질 이미지 및 설명 일괄 업로드
for (const url of targetUrls) {
  await uploadImageToLightspeed(targetProductId, { imageUrl: url });
}
```

추가로 저수준 API인 `uploadImageToLightspeed` 내부에도 만약
`Cannot upload product image on a variant child` 400 에러를 만나면 스스로 부모
상품을 역추적해 재시도하는 2중 안전장치를 달았습니다.

또한 발주서 상세 목록을 불러올 때도 자식 품목의 `images` 배열이 비어있다면 부모
상품의 이미지를 즉시 상속받아 프론트엔드에 전달함으로써, 불필요하게 "Missing
Image"로 분류되는 문제를 완벽히 해결했습니다.

---

## 2. 두 번째 난관: 과거 공급사 SKU 접두어와 오매칭 참사

두 번째 문제는 공급사(Dreamfarm) 크롤링 엔진에서 발생했습니다.

Lightspeed의 발주서 라인아이템 SKU는 `DREAMFARM-DFCL1020`처럼 되어 있었습니다.
이 SKU 그대로 BigCommerce 기반 공급사 검색창에 쿼리를 날렸더니 기괴한 일이
일어났습니다:

- 모든 제품에 엉뚱하게 첫 번째 상품인 "Ortwo"의 이미지가 들어가는 현상이
  발생했습니다.

### 원인 분석

- `search.php?search_query=DREAMFARM-DFCL1020`을 검색하면 검색엔진이
  `DREAMFARM`이라는 단어를 키워드로 인식합니다.
- Dreamfarm 사이트의 모든 제품은 브랜드명이 "Dreamfarm"이므로 **모든 제품이 검색
  결과에 매칭**되어 검색 결과 최상단에 있는 첫 번째 카드가 항상 선택된 것입니다.
- 반대로 특정 신제품들은 `DREAMFARM-`이 붙어있으면 0건이 반환되기도 했습니다.
- 과거 Lightspeed POS 운영 정책상 SKU 앞에 공급사명 프리픽스를 강제로 붙였던
  레거시 데이터가 원인이었습니다.

### 해결책: 식별자 보존과 검색용 정규화 분리 (`normalizeSku`)

```typescript
/**
 * Lightspeed 상의 공급사 접두어(예: DREAMFARM-, WOK- 등)를 정규화하여 순수 공급사 SKU를 추출합니다.
 */
export function normalizeSku(rawSku: string): string {
  let cleaned = rawSku.trim();
  cleaned = cleaned.replace(/^(?:DREAMFARM|DREAM\s*FARM|WOK)[-_ ]+/i, "");
  return cleaned; // "DREAMFARM-DFCL1020" -> "DFCL1020"
}
```

- **Lightspeed POS 및 허브 DB**: 원래의 전체 SKU(`DREAMFARM-DFCL1020`)와 고유
  `productId`를 100% 보존.
- **외부 공급사 사이트 크롤링**: 반드시 `normalizeSku`를 거친 순수 제조사
  SKU(`DFCL1020`)로만 검색.

여기에 더해 **3단계 다계층 탐색 전략**을 구축했습니다:

1. **1단계**: 순수 SKU로 BigCommerce 검색
2. **2단계**: SKU 검색 결과가 없을 경우 정규화된 상품명(`Supoon Mini`, `Sharple`
   등)으로 검색 후 후보 카드들의 텍스트 매칭 점수(`findBestProductCard`)를
   계산해 최적 카드 선정
3. **3단계**: 단독 상품 슬러그(`https://dreamfarm.com/mini-flisk/`) 다이렉트
   탐색

이 조치로 발주서 내 누락 품목 16개 전수가 오매칭 없이 **100% 정확하게
매칭**되었습니다.

---

## 3. 세 번째 난관: 무손실 고화질 원본 추출과 플레이스홀더 제거

크롤링 초기에는 Lightspeed에 등록된 이미지가 160x160 썸네일로 깨져 보이는 문제가
있었습니다.

### BigCommerce CDN 원본 변환

Dreamfarm의 검색 결과 카드나 썸네일 URL은 다음과 같이 크기 제한 파라미터가 붙어
있습니다.

```
https://cdn11.bigcommerce.com/s-fmmgsgph54/images/stencil/160w/products/246/1180/...jpg
```

이를 정규표현식으로 무손실 원본 디렉토리인 `/stencil/original/`로 치환하도록
개선했습니다.

```typescript
function cleanBigCommerceUrl(url: string): string {
  let clean = url.split("?")[0] || "";
  clean = clean.replace(/\/stencil\/[^\/]+\//, "/stencil/original/");
  return clean;
}
```

또한 단 1장만 가져오던 방식에서 상세 페이지의 `.productView-thumbnail-link`를
모두 파싱하여 **품목당 4~8장의 전체 갤러리 이미지(다양한 각도, 기프트 박스,
라이프스타일 컷)**를 통째로 수집하도록 확장했습니다.

동시에 과거 코드에 임시로 들어가 있던 `https://dreamfarm.com/nospilla/` 하드코딩
폴백을 완전히 제거하여, 매칭 실패 시 엉뚱한 제품의 이미지가 잘못 등록되는
리스크를 원천 차단했습니다.

---

## 4. 시맨틱 HTML 설명(Description) 자동 보강

이미지만 채우는 것에 그치지 않고, Lightspeed의 Description이 비어있는 경우
공급사 상세 페이지에서 아래 요소들을 깔끔한 시맨틱 HTML로 조립하여 함께
업데이트하도록 구현했습니다:

- 한 줄 소개문 (`<p>`)
- 핵심 특징 불릿 리스트 (`<ul><li>`)
- 스펙 아코디언 (길이, 무게, 재질, 식기세척기 가능 여부 등 `<h3>`, `<ul>`)

```html
<p>Dopener is a smooth edge can opener that’s easy to use and opens jars and ring pull cans.</p>

<ul>
  <li>Unique mechanism is driven by pushing two handles together</li>
  <li>Hardened stainless steel cutting wheel safely cuts lids without burrs</li>
</ul>

<h3>Product Details</h3>
<ul>
  <li><strong>Length:</strong> 19.5cm / 7.7”</li>
  <li><strong>Material:</strong> Polypropylene, Stainless Steel</li>
</ul>
```

---

## 5. 대량 처리 복원력과 대시보드 UX (Nuxt 4 + oRPC)

수십 개의 품목을 일괄 처리(`Fetch Image All`)할 때 발생할 수 있는 장애를
방지하기 위해 세심한 방어 코드를 적용했습니다.

1. **API Rate Limit 방지**:
   - Lightspeed API 연속 호출 시 300ms 딜레이
   - 공급사 웹 크롤링 요청 간 600ms 딜레이 부여
2. **개별 장애 격리 (Fault Isolation)**:
   - 특정 상품 하나가 공급사 사이트에 없거나 404가 발생해도 전체 배치가 멈추지
     않고 건너뛰며(`try-catch`), 프로그레스 바에 `skippedCount`로 표시
3. **작업 취소(Cancel) 지원**:
   - 진행 중 사용자가 원할 때 즉시 중단할 수 있는 취소 토글 제공

---

## 마치며

| 구분            | 개선 전                                           | 개선 후                                          |
| --------------- | ------------------------------------------------- | ------------------------------------------------ |
| **이미지 등록** | 수동 다운로드 후 업로드 (자식 품목 400 에러 빈발) | **1-Click 일괄 자동 등록 (부모 자동 승격)**      |
| **이미지 품질** | 160w 저화질 썸네일 단 1장                         | **무손실 Original 고화질 갤러리 (품목당 4~8장)** |
| **상품 설명**   | 수동 작성 또는 빈칸                               | **소개, 특징, 스펙 시맨틱 HTML 자동 추출**       |
| **SKU 매칭률**  | 프리픽스 오매칭으로 엉뚱한 제품 등록              | **`normalizeSku` + 다계층 탐색으로 100% 매칭**   |

이기종 커머스 시스템을 통합할 때 가장 중요한 것은 **각 플랫폼 고유의 데이터
제약(Lightspeed의 매트릭스 부모/자식 구조)을 깊이 이해하고 이를 추상화해 주는
것**입니다.

이제 매장 관리자는 새 발주서가 도착했을 때 `Fetch Image All` 버튼 한 번만
누르면, 고화질 갤러리와 스펙 설명이 완벽하게 갖춰진 상품 카탈로그를 손쉽게
운영할 수 있게 되었습니다.
