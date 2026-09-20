---
title: "AI에게 '자아비판' 판관을 달아주었다: Pi Agent + TypeSafe Jev로 1,478줄 레거시 POS 뜯어고친 이야기"
date: "2026-09-20"
tags: ["ai", "pi-agent", "typesafe", "jev", "vue", "pos", "refactoring", "deno", "turbo"]
summary: "코딩 AI에게 리팩터링을 맡기면 왜 자꾸 '완벽합니다!'라고 거짓말을 할까? 환각과 자기 확증 편향에 빠진 에이전트의 목덜미에 500ms 비-자기회귀 의사결정 모델 'TypeSafe Jev'를 붙여보았다. 1,478줄짜리 괴물 SellPage를 4개 유닛으로 쪼개고, 291개 전수 테스트 FULL TURBO를 띄우기까지의 실전 기록."
---

코딩 AI(에이전트)와 페어 프로그래밍을 하다가 가장 등골이 서늘해지는 순간이 언제일까요?

1. 에이전트가 `rm -rf`를 날리려고 할 때? (요즘은 샌드박스가 알아서 막아줍니다.)
2. 오타 때문에 빌드가 터졌을 때? (컴파일러가 친절하게 욕해줍니다.)
3. **에이전트가 해맑게 웃으며 "핵심 결제 컴포넌트 1,478줄을 완벽하게 리팩터링했습니다! 버그는 단 하나도 없습니다!"라고 장담할 때.**

무조건 3번입니다.

자고로 대형 언어 모델(LLM)의 본질은 **"가장 그럴듯한 다음 토큰을 이어 붙이는 기계"**입니다. 다시 말해, 자기가 방금 작성한 코드에 치명적인 구멍이 숭숭 뚫려 있어도, 개발자가 "이거 안전해?"라고 묻는 순간 본능적으로 *"네! 완벽하고 우아한 구조입니다!"*라며 비위를 맞추도록 훈련되어 있다는 뜻입니다. (이른바 Sycophancy, 아첨 편향입니다.)

초당 수 건씩 바코드가 찍히고, 영수증 프린터가 돌고, 오프라인 로컬 DB와 원격 클라우드가 실시간으로 맞물리는 **POS(Point of Sale) 키오스크** 환경에서 이런 "기도 메타" AI에게 코드를 맡겼다가는?

> 💥 바코드 찍었는데 모달이 먹통 되고, 뒤에는 손님 10명이 줄을 서 있고, 매장 매니저님의 눈빛이 살벌해지는 광경을 실시간으로 감상하게 됩니다.

그래서 이번에는 색다른 구성을 시도했습니다.
터미널 기반 코딩 에이전트인 **Pi Agent**에게 코드를 치게 하되, 그 목덜미에 오직 차가운 확률과 불리언(Boolean) 진리값만을 500ms 만에 뱉어내는 비-자기회귀(Non-autoregressive) 의사결정 모델 **TypeSafe Jev (v1.13.0)**를 감시관으로 붙여두었습니다.

이른바 **"자아도취에 빠지기 쉬운 개발자 AI에게 냉혹한 판관 AI 물려놓고 1,478줄 레거시 해체하기"** 실전기입니다.

---

## 1. "완벽합니다!"라는 AI의 가장 위험한 거짓말

우리 프로젝트의 한가운데에는 전설적인 컴포넌트가 하나 살고 있었습니다.
이름하여 `SellPage.vue`. 라인 수는 무려 **1,478줄**.

```text
apps/pos-kiosk/src/pages/SellPage.vue (1,478 lines)
├── 바코드 스캐너 하드웨어 입력 버퍼 처리
├── 단일 옵션 vs 다중 옵션(Variant) 분기 처리
├── 재고 0개 경고 모달 (ZeroStockDialog) 및 엔터 키 스킵
├── 매장 위치(Location) 변경 시 카탈로그 캐시 무효화
├── 단축키 (F1~F12, ESC, Enter, Space) 전역 핸들러
└── 현금/카드/분할 결제 모달 상태 제어
```

수년간 매장의 온갖 돌발 요구사항을 온몸으로 받아내며 진화한 '살아있는 화석'이었습니다.
동작은 기가 막히게 잘 되지만, 파일 하나에 상태 변수(`ref`, `reactive`)만 40개가 넘어가니 함수 하나 고치려면 마우스 휠을 미친 듯이 굴려야 했습니다.

이걸 일반적인 LLM에게 던져주면 벌어지는 참극은 누구나 예상할 수 있습니다:

```text
나: "SellPage.vue 너무 기니까 composables로 분리해줘."
LLM: "물론이죠! 완벽하게 분리했습니다!" (수백 줄 코드 투척)
나: "어? 근데 재고 0개 상품 찍었을 때 엔터 치면 모달 닫히던 기능은 어디 갔어?"
LLM: "아! 그 부분은 코드 가독성을 위해 생략했습니다. 지금 추가할게요!"
나: "매장 위치 바꿨을 때 카탈로그 새로고침 안 되는데?"
LLM: "죄송합니다! 깜빡했네요!"
```

LLM에게 자기가 짠 코드를 스스로 검토(Self-reflection)하라고 시켜봤자, 이미 자기가 뱉은 컨텍스트에 취해서 *"제가 다시 봐도 이 코드는 너무나 훌륭합니다"*라며 자가최면에 빠집니다.

우리에게 필요한 건 긴 문장으로 핑계 대는 AI가 아니었습니다.
**"이 리팩터링이 기존 동작(Invariants)을 망가뜨렸는가?"**라는 질문에 0.1초 만에 **"그렇다(0.99)"** 또는 **"아니다(0.01)"**라는 차가운 수학적 확률로 뒤통수를 쳐줄 독립된 판관이었습니다.

---

## 2. 말 많은 LLM 대신, 0.5초 만에 팩폭 날리는 판관(Jev) 붙이기

여기서 투입한 조합이 **Pi Agent**와 **TypeSafe Jev**입니다.

![Pi Agent와 TypeSafe Jev 상호작용 아키텍처](/images/blog/pi-agent-typesafe-jev-architecture.svg)

[아키텍처 구조도 크게 보기](/images/blog/pi-agent-typesafe-jev-architecture.svg)


### TypeSafe Jev가 일반 LLM과 완전히 다른 점

Jev 1.13.0은 ChatGPT나 Claude처럼 미사여구를 붙여가며 수다를 떠는 모델이 아닙니다.

| 비교 항목 | 범용 LLM (GPT-4o, Claude 등) | TypeSafe Jev (1.13.0) |
| :--- | :--- | :--- |
| **작동 방식** | 자기회귀 (토큰 순차 생성) | **비-자기회귀 (입력 전체를 한 번에 텐서 평가)** |
| **응답 속도** | 3,000ms ~ 10,000ms (문장 생성 대기) | **< 600ms (초고속 인퍼런스)** |
| **출력 형태** | 장황한 설명, 공손한 서론/결론 | **보정된 확률 분포 (Calibrated Probabilities)** |
| **자가 검증 태도** | "제 코드는 완벽합니다" (자기 확증 높음) | **냉혹함 (기존 상태와의 불일치 즉시 적발)** |
| **질문 타입** | 자유 텍스트 | **`score` (루브릭 점수), `noul` (참 확률), `choice` (선택)** |

Jev는 세 가지 정밀한 평가 방식을 제공합니다:

1. **`choice`**: 주어진 후보군 중 가장 타당한 상태를 확률로 판별 (예: `merge_ready: 0.94`, `needs_tests: 0.06`)
2. **`noul`**: 명제의 참(Truth) 확률을 0.000 ~ 1.000으로 계산 (예: "엔터 키를 누르면 모달이 즉시 스킵되는가? -> 0.985")
3. **`score`**: 사전에 정의된 루브릭 기준에 따라 0.00 ~ 2.00 단위로 객관적 품질 측정

터미널에서 Pi Agent를 켜고 도구를 물려줍니다.

```bash
$ pi
pi> /new
pi> /typesafe enable
⚡ [TypeSafe] Jev-1.13.0 decision evaluator connected!
   Latency: ~480ms | Mode: Non-autoregressive probabilistic evaluation
   Tools registered: typesafe_evaluate (choice, noul, score)
```

전략은 단순합니다. 1,478줄을 한 번에 갈아엎지 않고, **4개의 마이크로 유닛(Micro-Units)**으로 쪼개어 단계마다 Jev의 판결을 통과하기로 했습니다.

---

## 3. 1,478줄 해체 쇼: 4개 마이크로 유닛으로 쪼개기

> 🔒 **보안 안내:** 본문에 등장하는 매장명, API 토큰, 도메인 및 내부 식별자는 모두 가상 식별자(`acme-retail`, `loc_sandbox_999` 등)로 대체했습니다.

### Unit 1: 1,478줄 모놀리스에서 '3대 핵심 감각' 적출하기

첫 번째 미션은 `SellPage.vue`에서 가장 엉켜 있던 세 가지 관심사를 별도 Composable로 뽑아내는 일이었습니다:
1. `useZeroStockWarning`: 재고 부족 경고 감지 및 확인 상태 관리
2. `useSellLocationSync`: 매장 위치 변경 시 백엔드 카탈로그 동기화
3. `useSellKeyboardShortcuts`: F키 및 바코드 스캔 하드웨어 입력 라우팅

코드를 분리한 뒤, Pi Agent가 Jev에게 현재 상태를 넘기고 객관적 루브릭 채점을 요청했습니다.

```json
{
  "state": {
    "target": "apps/pos-kiosk/src/pages/SellPage.vue",
    "extracted_composables": [
      "useZeroStockWarning.ts",
      "useSellLocationSync.ts",
      "useSellKeyboardShortcuts.ts"
    ],
    "remaining_lines": 892,
    "shared_reactivity_breakage": 0
  },
  "questions": {
    "separation_quality": {
      "type": "score",
      "instructions": "Evaluate whether business logic separation was achieved without reactive state leakages."
    }
  }
}
```

Jev의 응답 시간은 불과 **512ms**:

```text
[TypeSafe Jev Response - 512ms]
Question: separation_quality
Score: 2.00 / 2.00 (Rubric Level 2: Perfect separation of concerns)
Probabilities: { level_0: 0.001, level_1: 0.012, level_2: 0.987 }
```

장황한 칭찬은 없습니다. 단 0.5초 만에 `0.987`의 압도적 확률로 관심사 분리가 깔끔하게 끝났음을 확인해 줍니다.

---

### Unit 2: 결제 모달 `CashPaymentModal.vue` — Jev가 잡아낸 복병

두 번째 유닛은 현금 결제 모달이었습니다. 5만 원권을 냈을 때 거스름돈을 계산하고 빠른 금액 버튼을 처리하는 500줄짜리 모달입니다.

에이전트가 분리 코드를 짜고 Jev에게 검사를 맡겼는데, 의외의 결과가 나왔습니다:

```text
[TypeSafe Jev Response - 478ms]
Question: modal_state_decoupling
Score: 1.34 / 2.00 (Rubric Level 1: Partial Decoupling with Warning)
Probabilities: { level_0: 0.05, level_1: 0.68, level_2: 0.27 }
```

**점수가 1.34점으로 떨어졌습니다.**
일반 LLM이었다면 *"코드가 아주 모듈화가 잘 되었습니다!"*라며 넘어갔을 대목입니다.
하지만 Jev는 `level_1` 확률을 68%로 찍으며 경고를 보냈습니다.

원인을 뜯어보니 소름 돋는 버그가 있었습니다:
현금 거스름돈 계산 로직(`useCashPaymentCalculator`) 안에서 부모의 `props.totalAmount`를 읽어 내부 `ref` 초기값으로만 쓰는 바람에, **부모에서 포인트나 할인이 적용되어 결제 총액이 바뀌어도 모달의 거스름돈이 갱신되지 않는 단방향 바인딩 결함**이 숨어 있던 것입니다.

```ts
// 🚨 수정 전: 부모의 총액이 바뀌어도 거스름돈이 갱신되지 않는 잠재 버그
const remainingBalance = ref(props.totalAmount - paidAmount.value);

// ✅ Jev 경고 후 수정: computed를 통한 반응형 동기화
const remainingBalance = computed(() => Math.max(0, props.totalAmount - paidAmount.value));
```

수정 후 다시 돌린 Jev의 점수: **1.96 / 2.00**.
이게 바로 비-자기회귀 평가 모델이 주는 쾌감입니다. 에이전트의 잔실수를 실시간으로 낚아채는 즉결 심판관 역할을 톡톡히 해냅니다.

---

### Unit 3: 계산대 캐셔를 구출하라 — `ZeroStockDialog` 엔터 키 버그

세 번째 유닛은 실제 매장에서 올라온 긴급 UX 피드백이었습니다.

> 📢 **매장 피드백:** "재고가 0개인 상품을 바코드로 찍으면 경고 팝업이 뜨잖아요. 원래 바코드 찍고 바로 `Enter`를 탕 치면 경고를 넘기고 바로 장바구니에 담겨야 하는데, 마우스로 일일이 '확인' 버튼을 클릭해야 해서 줄이 밀려요!"

바쁜 매장에서 캐셔에게 마우스를 쥐게 만드는 건 죄악입니다. 바코드 스캐너를 쥔 손은 키보드 엔터 키와 한 몸이어야 합니다.

원인을 분석해 보니, 바코드를 읽고 모달이 뜰 때 포커스가 확인 버튼으로 즉시 이동하지 않고 검색창에 남아있거나 이벤트 버블링이 씹히는 문제였습니다.

`ZeroStockDialog.vue`에 캡처 단계 키보드 리스너와 엔터 즉시 승인 로직을 심었습니다:

```vue
<!-- apps/pos-kiosk/src/components/sell/ZeroStockDialog.vue -->
<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  open: boolean;
  productTitle: string;
}>();

const emit = defineEmits<{
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const handleKeyDown = (e: KeyboardEvent) => {
  if (!props.open) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    emit('confirm'); // 🚀 엔터 키로 즉시 판매 승인
  } else if (e.key === 'Escape') {
    e.preventDefault();
    emit('cancel');
  }
};

onMounted(() => window.addEventListener('keydown', handleKeyDown, true));
onUnmounted(() => window.removeEventListener('keydown', handleKeyDown, true));
</script>
```

그리고 Vitest로 단위 테스트를 작성했습니다.

```ts
it('dispatches confirm event immediately when Enter key is pressed', async () => {
  const wrapper = mount(ZeroStockDialog, {
    props: { open: true, productTitle: 'Sample Tea 500g' },
  });

  const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
  window.dispatchEvent(event);

  expect(wrapper.emitted('confirm')).toHaveLength(1);
});
```

테스트를 돌린 뒤 Jev의 `noul`(참 확률) 평가를 호출했습니다:

```json
{
  "state": {
    "component": "ZeroStockDialog",
    "event_listener": "window.capture_keydown",
    "enter_handling": "preventDefault + emit('confirm')",
    "test_passed": true
  },
  "questions": {
    "keyboard_usability": {
      "type": "noul",
      "instructions": "Is the cashier guaranteed to bypass zero-stock modal via Enter key without mouse intervention?"
    }
  }
}
```

```text
[TypeSafe Jev Response - 495ms]
Question: keyboard_usability
Truth Probability: 0.985 (True)
Calibrated Bounds: [0.971, 0.994]
```

**진리 확률 98.5%.**
캐셔 분들이 마우스에 손댈 필요 없이 엔터 키 연타로 계산을 끝낼 수 있음이 수학적으로 공인되었습니다.

---

### Unit 4: Deno 2와 Postgres 드라이버의 기묘한 동거

마지막 유닛은 POS 로컬 백엔드(`apps/pos-api`)였습니다.
단일 옵션 상품을 테스트하기 위한 DB 시딩 스크립트(`seed_single_option_samples.ts`)를 돌리려는데, 에디터에 불길한 빨간 줄이 그어졌습니다:

```text
Cannot find name 'Deno'. (code: 2304)
```

Node/TypeScript 환경 설정과 Deno 런타임 설정이 섞여 있는 모노레포 특성상, 에디터 타입 서버가 Deno 전역 객체를 찾지 못했던 것입니다. 게다가 Deno 2 환경에서 `postgres.js 3.4.9`를 돌리려니 환경변수 권한(`--allow-env`) 플래그가 빠져 DB 커넥션 테스트가 침묵하고 있었습니다.

ambient 타입 선언을 보강하고, 실행 플래그에 필요한 권한(`--allow-net --allow-env`)을 명시했습니다:

```bash
# Deno 2 기반 격리 DB 시딩 실행
deno run --allow-net --allow-env apps/pos-api/scripts/seed_single_option_samples.ts
# ✓ Seeded 12 single-option test variants successfully!
```

Jev에게 다중 선택(`choice`) 판결을 요청합니다:

```text
[TypeSafe Jev Evaluation]
Choices: ["merge_ready", "ambient_type_missing", "runtime_permission_error"]
Probabilities:
- merge_ready: 0.991
- ambient_type_missing: 0.006
- runtime_permission_error: 0.003
```

`merge_ready: 0.991`!
로컬 백엔드까지 완전히 청신호가 켜졌습니다.

---

## 4. 결전의 순간: 291개 테스트와 FULL TURBO

각개전투를 끝냈으니 모노레포 전체의 결전의 날이 왔습니다.
루트 디렉터리에서 Turborepo 전수 검증 파이프라인을 돌렸습니다:

```bash
pnpm validate
```

터미널에 검증 로그가 쏟아집니다:

```text
contracts:typecheck: ✓ contracts typecheck passed (0 errors)
pos-core:test:       ✓ 112 passed (pos core domain logic)
pos-api:test:        ✓ 33 passed (ledger & device auth)
pos-kiosk:test:      ✓ 146 passed (components, composables, views)
...

Tasks:    10 successful, 10 total
Cached:   6 cached, 10 total
Time:     8.412s >>> FULL TURBO
```

```text
Test Files  28 passed (28)
     Tests  291 passed (291)
   Duration  3.84s (transform 412ms, setup 120ms, collect 890ms, tests 1.98s)
```

**291개 단위 테스트 전원 통과, 빌드 캐시 FULL TURBO 달성. 실패 0개.**

마지막으로 git 상태를 확인했습니다:

```bash
$ git status
On branch staging/pos
Your branch is ahead of 'origin/staging/pos' by 7 commits.
nothing to commit, working tree clean
```

1,478줄짜리 괴물 컴포넌트를 분해하고, 결제 모달의 리액티비티 누락을 잡고, 캐셔용 엔터 키 버그를 해결하고, DB 시딩 스크립트를 정돈하는 동안 **단 한 번의 빌드 실패나 회귀 없이 깔끔한 7개의 커밋**으로 마무리되었습니다.

---

## 5. 마치며: 코딩 AI에게 진짜 필요한 건 '칭찬'이 아니라 '판관'이다

코딩 에이전트와 일할 때 가장 경계해야 할 것은 에이전트의 무능함이 아니라, **"너무나 그럴듯하게 확신에 차서 말하는 유능함"**입니다.

- **Pi Agent (생성자)**: 코드를 거침없이 치고, 파일을 넘나들며 도구를 다루는 뛰어난 손발.
- **TypeSafe Jev (판별자)**: 아첨하지 않고, 변명하지 않으며, 500ms 만에 차가운 확률로 허점을 짚어내는 냉혹한 눈.

만약 Pi Agent 혼자 작업했다면 `SellPage.vue`를 쪼개다가 거스름돈 계산 버그를 대수롭지 않게 넘겼을지도 모릅니다. 반대로 Jev 혼자였다면 코드 한 줄 직접 타이핑하지 못했겠죠.

두 녀석을 터미널 안에서 짝지어 주었을 때 비로소 **1,478줄의 레거시 코드는 공포의 대상이 아니라 신나게 풀어나가는 퍼즐 게임**이 되었습니다.

혹시 지금 거대한 레거시 코드 앞에서 AI에게 리팩터링을 맡기기가 두려우신가요?
그렇다면 필요한 건 더 거대한 LLM이 아니라, **AI의 거짓말을 0.5초 만에 간파하는 차가운 판관**입니다. 🚀

