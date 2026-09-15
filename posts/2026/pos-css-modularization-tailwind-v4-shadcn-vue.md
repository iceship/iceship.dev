---
title: "2,474줄 거대 CSS 해체 쇼부터 Tailwind v4 안착기: 레거시 POS에 shadcn-vue를 평화롭게 심는 법"
date: "2026-09-16"
tags: ["pos", "tailwind", "tailwindcss-v4", "shadcn-vue", "css", "vue", "refactoring", "e2e", "playwright"]
summary: "2,474줄짜리 모놀리식 CSS를 8개 모듈로 쪼개고, Preflight 폭탄을 피해 Tailwind CSS v4.3.3과 shadcn-vue 컴포넌트를 평화롭게 안착시킨 좌충우돌 실전기. Specificity(명시도) 전쟁, #app 스코프 격리, 15개 뷰포트 픽셀 스냅샷 0% 회귀 검증까지의 이야기입니다."
---

소프트웨어 엔지니어가 평화로운 오후를 보내다가 갑자기 식은땀을 흘리는 순간이 몇 가지 있습니다.

1. "DB에 마이그레이션 걸었는데 락 걸려서 서비스 멈췄어요."
2. "깃 충돌 났는데 실수로 force push 날렸어요."
3. **"기존 레거시 화면에 Tailwind CSS 좀 깔아서 예쁜 컴포넌트 몇 개 써볼까?"**

네, 3번입니다. 특히 수백 개의 미디어 쿼리와 전역 셀렉터가 얽히고설킨 소매점 키오스크 POS 시스템이라면 더더욱 그렇습니다.

현재 저희 매장에서 돌아가는 POS 키오스크의 CSS를 열어봤을 때 마주한 숫자는 충격적이었습니다:
- `sell.css`: **1,739줄**
- `catalog.css`: **735줄**
- 도합: **2,474줄의 모놀리식 CSS 괴물**

스크롤을 휠로 내리다 손가락 관절염이 올 지경이었죠. 여기에 요즘 핫한 **shadcn-vue**의 세련된 UI를 점진적으로 도입하고 싶다는 욕망이 더해졌습니다. 하지만 아무 생각 없이 `tailwindcss`를 얹고 Preflight를 켜는 순간?

> 💥 **상상도:** 카운터 레이아웃 와르르, 바코드 스캔 배너 실종, 결제 서랍 버튼은 투명인간이 되고, 매장 매니저님의 분노 섞인 전화가 울려 퍼진다...

그래서 저희는 **"기존 디자인과 동작을 0.001%도 해치지 않으면서, 최신 Tailwind CSS v4.3.3과 shadcn-vue를 평화롭게 공존시키는 극한의 안전 운전 프로젝트"**를 감행했습니다.

외과의사 같은 CSS 무손실 해체 쇼부터 Specificity(명시도) 암투, 그리고 Tailwind v4 CSS-First 전환기까지의 흥미진진한 여정을 정리해 봅니다.

---

## 1막: 외과의사의 심정으로 집도한 2,474줄 해체 쇼

가장 먼저 해야 할 일은 이 거대한 두 파일(`sell.css`, `catalog.css`)을 책임별로 쪼개는 것이었습니다.

하지만 CSS는 조금만 순서가 바뀌어도 캐스케이드(Cascade)와 명시도 때문에 레이아웃이 미세하게 틀어집니다. "어라? 폰트 크기가 1px 줄었네?", "어라? 마진이 왜 2px 밀렸지?" 같은 참사를 막기 위해 **테스트 주도 리팩터링(TDD)**의 철학을 CSS에도 적용했습니다.

### A. 15장의 '절대 기준' 스크린샷 확보
코드 한 줄 건드리기 전에, Playwright를 이용해 매장에서 사용 가능한 모든 환경의 스크린샷을 찍어두었습니다:
- 1440x900 데스크톱 (다크 모드 / 라이트 모드)
- 1280x800 긴 상품명 장바구니
- 1024x768 아이패드 태블릿 드로어
- 390x844 모바일 뷰
- 1024x500 키오스크 저해상도 화면 (결제 버튼 스크롤 영역)
- 변형(Variant) 선택 팝업, 외상/보류(Parked) 목록, 캐셔 로그인 오버레이, 현금 결제 모달, 장애 복구 모달...

총 **15장의 기준 스냅샷**을 금고에 모셔두고 집도를 시작했습니다.

### B. 8개의 책임으로 분할
거대한 덩어리를 잘 드는 칼로 발라내듯 8개의 모듈로 분리했습니다:

```text
apps/pos-kiosk/src/styles/
├── base.css            # 전역 리셋, 박스 사이징, prefers-reduced-motion (99줄)
├── shell.css           # 상단바, 사이드바, 테마 토글, 매장 로고 (285줄)
├── catalog.css         # 카탈로그 테이블, 검색 필터, 상세 패널 (588줄)
├── sell-layout.css     # 판매 워크스페이스, 헤더, 카운터 그리드 (103줄)
├── product-finder.css  # 바코드 스캐너, 카테고리 탭, 퀵 키, 상품 타일 (356줄)
├── sale-cart.css       # 장바구니 드로어, 라인 아이템, 수량 증감, 결제 버튼 (479줄)
├── sell-dialogs.css    # 옵션 선택, 보류 판매, 초기화 확인 모달 (93줄)
├── sell-responsive.css # 1650px+, 태블릿, 모바일, 저해상도 미디어쿼리 (467줄)
└── index.css           # 원본 캐스케이드 순서를 엄격히 보존하는 단일 진입점 (8줄)
```

### C. 픽셀 대조 결과: 100% 일치!
분리 후 다시 스크린샷을 찍어 원본과 바이트 단위로 대조했습니다.

```bash
Comparing 15 snapshot files...
01_1440x900_sell_dark.png:        EXACT MATCH (100%)
02_1440x900_sell_light.png:       EXACT MATCH (100%)
03_1440x900_catalog_desktop.png:  EXACT MATCH (100%)
05_1024x768_cart_drawer.png:      EXACT MATCH (100%)
...
```
인풋창의 텍스트 커서 깜빡임과 타임스탬프 1바이트 차이를 제외하고, 15개 뷰포트 전체가 **100% 픽셀 퍼펙트하게 일치**했습니다! 이로써 깨끗하고 유지보수하기 쉬운 CSS 기반이 마련되었습니다.

---

## 2막: Specificity(명시도)의 복병, `.sell-app button` vs Tailwind

이제 Tailwind를 얹을 차례인데, 숨어있던 거대한 복병이 튀어나왔습니다.
바로 `base.css`에 남아있던 이 녀석이었습니다:

```css
/* 과거의 개발자가 남겨둔 유산... */
.sell-app button {
  border: 1px solid transparent;
  color: inherit;
  background: transparent;
}
```

이 규칙의 CSS 명시도를 계산해 봅시다:
- `.sell-app` (클래스 1개 = 0, 1, 0)
- `button` (태그 1개 = 0, 0, 1)
- **합계: (0, 1, 1)**

반면, Tailwind나 shadcn-vue가 생성하는 유틸리티 클래스는 어떨까요?
```html
<button class="bg-primary text-white">결제하기</button>
```
- `.bg-primary` (클래스 1개 = **0, 1, 0**)

**(0, 1, 1) vs (0, 1, 0)...**
CSS 세계의 엄격한 신분제도에 의해, `.sell-app button`이 무조건 이깁니다! 즉, Tailwind로 아무리 예쁘게 빨간색(`bg-primary`) 배경을 칠해도 `.sell-app button`의 `background: transparent`가 가차 없이 덮어버려서 **투명 버튼**이 되어버리는 대참사가 벌어집니다.

### 🚫 해서는 안 될 타협: 전역 `!important`
이 문제를 해결하겠다고 `tailwind.config.js`에 `important: true`를 켜는 순간, Tailwind의 모든 유틸리티에 `!important`가 덕지덕지 붙습니다. 이것은 기술 부채를 핵폭탄으로 갚는 꼴입니다.

### ✅ 우아한 해법: `#app` 네스팅 스코핑
저희는 Tailwind 컴파일러에게 이렇게 지시했습니다:
> "모든 유틸리티에 ID 셀렉터 `#app`을 붙여서 생성해라!"

```css
#app {
  @import "tailwindcss/utilities.css" source(none);
}
```
이렇게 하면 `.bg-primary`는 브라우저에 다음과 같이 컴파일됩니다:
```css
#app .bg-primary {
  background-color: var(--color-primary);
}
```
- `#app` (ID 1개 = 1, 0, 0)
- `.bg-primary` (클래스 1개 = 0, 1, 0)
- **합계: (1, 1, 0)**

**(1, 1, 0) >>> (0, 1, 1)!**
전역 `!important`를 단 하나도 쓰지 않고도, Tailwind 유틸리티가 레거시 버튼 리셋을 아주 점잖고 합법적으로 제압하게 만들었습니다. 또한 `#app` 밖에 있는 요소나 미전환 레거시 컴포넌트에는 일절 영향을 주지 않습니다.

---

## 3막: Tailwind v3를 건너뛰고 v4.3.3 직행 열차 탑승

당초 계획은 익숙한 Tailwind v3.4로 시작하는 것이었지만, 저희는 과감하게 최신 **Tailwind CSS v4.3.3**으로 직행했습니다. v4가 제공하는 **CSS-first 아키텍처**가 이 하이브리드 환경에 훨씬 더 깔끔하게 들어맞았기 때문입니다.

### A. `tailwind.config.js`의 안락사
Tailwind v4에서는 자바스크립트 설정 파일이 필요 없습니다. 모든 설정이 CSS 파일 하나(`src/tailwind.css`) 안에서 선언적으로 이루어집니다.

```css
/* apps/pos-kiosk/src/tailwind.css */

/* 1. Preflight(기본 리셋)는 100% 차단! 레거시 POS 스타일을 온전히 보존합니다. */
@import "tailwindcss/theme.css" layer(theme);

/* 2. 유틸리티는 오직 #app 안에서만 유효하도록 네스팅 */
#app {
  @import "tailwindcss/utilities.css" source(none);
}

/* 3. 스캔 대상 파일 지정 */
@source "../index.html";
@source "./";
@source not "./**/*.test.ts";

/* 4. 커스텀 다크 모드 (data-theme="dark" 속성 지원) */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

/* 5. 기존 brand.css 토큰과 1:1 인라인 바인딩 */
@theme inline {
  --color-border: var(--pos-border);
  --color-input: var(--pos-input-bg);
  --color-ring: var(--pos-accent);
  --color-background: var(--pos-bg);
  --color-foreground: var(--pos-text);
  --color-primary: var(--brand-primary);
  --color-primary-foreground: var(--brand-on-primary);
  --color-secondary: var(--pos-surface);
  --color-muted: var(--pos-surface-subtle);
  --color-accent: var(--pos-accent);
}
```

### B. Preflight 폭탄 원천 차단
Tailwind v4에서 Preflight를 끄는 방법은 정말 간단합니다: **`@import "tailwindcss/preflight.css"`를 안 쓰면 끝**입니다.
기존 브라우저 기본 엘리먼트 리셋이 전혀 주입되지 않으므로, 이미 완성되어 있는 POS의 버튼, 인풋, 제목 폰트가 1px도 흔들리지 않습니다.

### C. Autoprefixer 안녕!
Tailwind v4는 내부에 초고속 Rust 기반의 Lightning CSS를 품고 있어서, 번거롭던 `autoprefixer` 패키지를 완전히 삭제해도 벤더 프리픽스가 자동으로 처리됩니다. `postcss.config.js`는 단 3줄로 다이어트되었습니다:

```js
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
```

---

## 4막: 단 2개의 컴포넌트만 교체한 소심하지만 대담한 파일럿

새로운 기술을 도입할 때 가장 흔히 저지르는 실수는 **"기왕 하는 김에 화면 전체 버튼을 다 바꿔버리자!"**입니다. 그렇게 시작했다가 일주일 동안 회귀 버그 잡느라 밤을 새우게 되죠.

저희는 정확히 **단 2개의 요소**만 shadcn-vue 기반으로 파일럿 교체했습니다:

### 1. 새로고침 버튼 (`Button`)
상품 목록 우측 상단의 조그만 새로고침 버튼(`↻`):

```html
<!-- Before: 날것의 레거시 버튼 -->
<button class="refresh-products" :disabled="loading" aria-label="Refresh products" @click="initialize">
  ↻
</button>

<!-- After: shadcn-vue Button 컴포넌트 -->
<Button
  type="button"
  variant="ghost"
  size="icon"
  class="refresh-products"
  :disabled="loading"
  aria-label="Refresh products"
  @click="initialize"
>
  ↻
</Button>
```

### 2. 세일즈 프리뷰 태그 (`Badge`)
상단 헤더의 `SALES PREVIEW` 알림 배지:

```html
<!-- Before -->
<span class="preview-tag">SALES PREVIEW</span>

<!-- After: shadcn-vue Badge 컴포넌트 -->
<Badge variant="outline" class="preview-tag">SALES PREVIEW</Badge>
```

기존의 `.refresh-products`와 `.preview-tag` 클래스, 그리고 `aria-label`을 그대로 살려두었기 때문에, **기존에 작성된 66개의 E2E 테스트 셀렉터가 단 하나도 깨지지 않고 그대로 동작**했습니다.

---

## 5막: 검증의 축제 (68개 E2E + 실 PostgreSQL 리허설)

아무리 로컬에서 예뻐 보여도 검증 통과 못 하면 배포할 수 없습니다.
저희는 Tailwind v4 마이그레이션 전용 검증 스위트([`tailwind-pilot.spec.ts`](file:///Users/iceship/code/hestianco/hestianco-platform/apps/pos-kiosk/tests/e2e/tailwind-pilot.spec.ts))를 새로 추가했습니다:

1. **지오메트리 보존**: 파일럿 버튼이 정확히 40x40px을 유지하는지, 배지 폰트가 정확한지 확인.
2. **접근성 포커스 링**: Tab 키로 진입했을 때 다크 모드에서는 핑크빛 포커스 링(`--tw-ring-color: #f4a8b3`), 라이트 모드에서는 와인빛 포커스 링(`--tw-ring-color: #b51f32`)이 정확히 반응하는지 검증.
3. **스코프 격리 검증**: 유틸리티 클래스가 `#app` 내부에서는 정상 렌더링되지만, `document.body` 바깥에서는 투명하게 무효화되는지 DOM 프로브로 확인.

그리고 터미널에서 전체 검증을 돌렸습니다:

```bash
pnpm --filter @hestianco/pos-kiosk test:e2e
```

```text
Running 68 tests using 1 worker
...
  ✓  46 [chromium] › tests/e2e/tailwind-pilot.spec.ts › preserves pilot geometry and supplies a visible keyboard focus ring (225ms)
  ✓  47 [chromium] › tests/e2e/tailwind-pilot.spec.ts › generates branded destructive and opacity utilities only inside the POS scope (181ms)
...
  68 passed (39.6s)
```

이어서 도커 컨테이너로 실제 PostgreSQL을 띄우고 영수증 출력과 재고 원장 차감까지 검증하는 라이브 리허설까지:

```bash
pnpm pos:test:rehearsal
# [REHEARSAL] ALL LIVE INVENTORY & AUDIT LEDGER INVARIANTS VERIFIED! 1 passed (1.5s)

pnpm validate:pos
# Tasks: 10 successful, 10 total (FULL TURBO)
```

**단위 테스트 46개 통과, E2E 테스트 68개 통과, 라이브 판매 리허설 통과, 모노레포 체크 FULL TURBO 통과!**

---

## 에필로그: 레거시와 모던의 아름다운 동거

대부분의 엔지니어링 현장에서 "처음부터 다시 짜기(Rewrite)"는 거의 불가능하거나 막대한 비용을 치러야 합니다. 수많은 예외 처리와 비즈니스 엣지 케이스가 묻어있는 레거시 CSS를 하루아침에 다 버릴 수는 없죠.

이번 작업을 통해 얻은 교훈은 명확합니다:

1. **모듈화가 먼저다**: 덩어리가 크면 건드릴 수 없습니다. 테스트 스냅샷을 방패 삼아 먼저 안전하게 쪼개놓아야 합니다.
2. **Preflight를 두려워하라 (그리고 꺼라)**: 레거시 환경에 Tailwind를 얹을 때 가장 먼저 꺼야 할 것은 편견이 아니라 Preflight입니다.
3. **Specificity는 영리하게 통제하라**: 전역 `!important`로 맞불을 놓지 말고, `#app` 스코핑으로 상위 포식자가 되게 하세요.
4. **작게 시작하라**: 버튼 하나, 배지 하나부터 시작해 통과를 확인하면, 그 다음 백 개의 컴포넌트는 안심하고 확장할 수 있습니다.

이제 저희 POS 키오스크는 2,474줄의 모놀리식 CSS 공포에서 벗어나, 탄탄한 레거시 레이아웃 위에서 가장 최신의 **Tailwind CSS v4**와 **shadcn-vue**를 마음껏 누릴 준비를 마쳤습니다. 🎉

