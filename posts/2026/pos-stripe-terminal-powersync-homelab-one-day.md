---
title: "단말기는 시드니에, 개발자는 서울에: 작은 질문 하나가 POS 카드 결제까지 번진 하루"
date: "2026-09-25"
tags: ["pos", "stripe", "stripe-terminal", "powersync", "postgresql", "ci", "act", "docker", "homelab", "ai-agents", "deno"]
summary: "PowerSync Vue 컴포저블이 뭐냐는 가벼운 질문으로 시작했는데, 저녁에는 Docker와 결별하고, E2E 빨간불 15개를 끄고, 문서 1만 줄을 대청소하고, 홈랩에 PowerSync를 세우고, 호주 매장의 Stripe 단말기로 카드 결제 API까지 만들어 버렸다. 그 하루의 기록."
---

아침에 던진 질문은 정말 작았다.

> PowerSync Vue 컴포저블이 뭐야?

그리고 저녁이 되었을 때 내 작업 트리에는 이런 것들이 쌓여 있었다.

- 호주 Stripe 단말기 카드 결제 API (거절·취소·장애 복구 포함)
- Docker 없는 개발 환경과, 그럼에도 Docker로 도는 CI
- 초록색으로 돌아온 E2E 87개 (아침엔 15개가 빨간색이었다)
- 1만 줄짜리 문서 대청소
- 홈랩에 세운 개발용 PowerSync

"잠깐 이것만 보고"가 어떻게 하루가 되는지, 차근차근 적어본다.

---

## 1. 설치는 되어 있는데 아무도 부르지 않는 라이브러리

질문의 답은 금방 나왔다. `@powersync/vue`는 `useQuery`, `useStatus`, `useWatchedQuerySubscription` 같은 컴포저블을 제공한다. 그런데 문서를 보여주던 AI(Claude Code)가 한 줄을 덧붙였다.

> 참고로, 키오스크에 `@powersync/vue@0.6.0`이 설치되어 있지만 `src/` 어디에서도 import하지 않습니다.

냉장고 깊숙한 곳에서 유통기한 지난 소스를 발견한 기분이었다. 키오스크는 HTTP API와 PowerSync를 같은 인터페이스(`CatalogProvider`) 뒤에 두고 갈아 끼우는 구조라서, 컴포넌트가 SQL을 직접 부르는 컴포저블은 설 자리가 없었던 것이다. 나중에 "재고가 바뀌면 화면이 저절로 바뀌는" 기능을 만들 때 다시 꺼내 쓰기로 하고 넘어갔다.

그리고 바로 다음 질문이 하루를 바꿨다.

> pos-kiosk 확인해서, 호주에서 Stripe 단말기로 카드 결제할 수 있게 작업 준비 계획 좀 세워줘.

---

## 2. 호주에서 카드를 받으려면

계획을 세우면서 정한 핵심은 **server-driven 통합**이었다. 브라우저(키오스크)는 Stripe 키를 절대 갖지 않고, POS API가 Stripe에 "이 단말기에서 이 금액 받아줘"라고 요청한다. 단말기는 매장 인터넷으로 Stripe 클라우드와 직접 통신한다.

```
Kiosk ──POST /sales/card──▶ POS API ──PaymentIntent──▶ Stripe ──▶ WisePOS E (매장)
      ◀──GET /card/:id────        ◀──상태 조회──────
```

호주라서 챙길 것도 있었다.

- **eftpos**: 호주 국내 직불 네트워크다. 일반 Stripe 테스트 카드로는 테스트가 안 되고, eftpos 전용 테스트 카드(PIN 1234)가 따로 있다.
- **최소 결제 금액 50센트**: 0.40달러짜리 스티커를 카드로 팔 수는 없다.
- **타임아웃은 실패가 아니다**: 네트워크가 끊겼다고 결제 실패로 단정하면, 고객은 돈을 냈는데 판매 기록은 없는 최악의 상황이 된다.

단말기는 BBPOS WisePOS E로 정했고, 카드 환불은 1차 범위에서 빼기로 했다. 그런데 대화 도중 내가 한 말이 계획을 바꿨다.

> 카드 판매의 환불은 나중에 꼭 구현해야 되거든, 이거 정말 중요해서.

그래서 카드 환불은 "나중에"에서 **"실결제 시작 전 필수 조건"**으로 올라갔다. 그 전까지는 카드로 산 물건을 기존 화면으로 환불하면 현금이 나가는 경로가 생기니, 서버에서 막는 가드(`CARD_REFUND_NOT_SUPPORTED`)를 먼저 넣었다.

---

## 3. 준비 운동인 줄 알았는데 지뢰밭

DB 계약과 마이그레이션(`0014_card_payments.sql`)을 추가하고 테스트를 돌리자, 원래부터 있던 문제들이 줄줄이 나왔다.

### 7은 행운의 숫자가 아니었다

```ts
assertEquals(appliedCount, 7);
```

인증 테스트가 적용된 마이그레이션 수를 `7`로 박아두고 있었다. 누군가 마이그레이션을 추가한 순간부터 이 테스트는 조용히 실패하고 있었다. 매니페스트 길이와 비교하도록 바꿨다.

### 판매 상세 조회가 500

```
PostgresError: relation "pos_sales.refunds" does not exist
```

테스트용 마이그레이션 목록에 환불·교환 마이그레이션이 빠져 있었다. 판매 상세 API는 환불 테이블을 읽으니 테스트 DB에서는 500이 났다. 목록에 넣고 나니 이번에는 테스트용 API 역할에 환불 테이블 권한이 없었다. 하나를 고치면 다음 문이 열리는 방탈출 같았다.

### 권한을 줬는데 사라졌다

개발 DB에 마이그레이션을 적용하는 명령은 끝에 **API 역할 권한을 코드 정의대로 다시 부여**한다. 그런데 새 테이블 `card_payment_attempts`가 코드 정의에 없었다. 마이그레이션이 준 권한을 바로 다음 줄에서 회수해 버리는 구조였던 것이다. 권한 정의 코드에 추가하고, 준비 상태 점검에도 이 테이블을 넣어서 다음에는 점검 단계에서 바로 드러나게 했다.

### 매장을 만들면 재고 계정도 자동으로

판매 코드는 재고 계정이 없으면 새로 만드는데, API 역할에는 그 테이블 INSERT 권한이 없었다. 새 매장의 첫 판매가 500을 낼 수 있는 구조다. 매장을 만드는 경로가 카탈로그 동기화, CLI, 시드, 테스트 등 여러 곳이라, **DB 트리거 하나**로 해결했다.

```sql
CREATE TRIGGER locations_create_on_hand_stock_account
  AFTER INSERT ON pos_catalog.locations
  FOR EACH ROW EXECUTE FUNCTION pos_inventory.create_on_hand_stock_account();
```

앱 코드 다섯 군데에 같은 로직을 넣는 대신 DB에 한 번 넣었다. 게으른 개발자가 이긴다.

---

## 4. Docker와의 이별

작업 도중 내가 한 줄을 던졌다.

> docker는 이제 더 이상 사용안해

로컬 Docker DB, Docker로 띄우던 테스트 DB, 로컬 스테이징 compose, PowerSync PoC 스택을 모두 정리했다. 앞으로 내부 개발 DB는 LXC의 PostgreSQL(`10.80.40.4`)만 쓰고, Docker Compose는 Coolify 배포에서만 쓴다.

그런데 CI가 문제였다. GitHub 러너는 우리 LAN에 들어올 수 없다. 해결책은 의외로 간단했다. CI 러너 안에는 원래 Postgres 서비스 컨테이너가 있으니, **CI에서만 테스트 DB 주소를 바꾸면 된다.**

```ts
function resolveTestDbHost(): string {
  return Deno.env.get("GITHUB_ACTIONS") === "true" ? "127.0.0.1" : "10.80.40.4";
}
```

개발 DB 주소는 절대 바뀌지 않고 테스트 DB만 바뀐다. 덤으로, 어디서도 실행되지 않던 sync-worker 큐 통합 테스트 5개도 CI에서 돌기 시작했다.

### act가 밥값을 했다

push 전에 CI를 미리 돌려보려고 `act`를 홈랩 원격 Docker(`ssh docker`)에 붙였다. 첫 실행에서 바로 걸렸다.

```
/var/run/act/workflow/10: line 2: psql: command not found
```

GitHub의 `ubuntu-latest`에는 `psql`이 있지만 act 이미지에는 없다. push했다면 CI에서는 통과했을 테니, 이 차이는 영영 몰랐을 것이다. 테스트 DB 생성을 `psql` 대신 Deno 스크립트로 바꿔서 두 환경 모두에서 같게 돌게 했다. 이제 `pnpm ci:local` 한 줄이면 GitHub CI 잡 전체가 원격 Docker에서 돈다.

---

## 5. 빨간불 15개

키오스크 E2E를 돌리자 15개가 실패했다. 제 작업 이전 커밋에서도 **정확히 같은 15개**가 실패해서, 기존 문제라는 건 확인됐다. 원인은 다양했다.

1. **로컬 자동 로그인의 누출**: 개발 편의를 위해 넣은 자동 로그인이 `import.meta.env.DEV`에만 걸려 있어서, mock E2E에서도 켜졌다. 등록 화면 대신 "OFFLINE"이 떴다. 환경변수로 E2E에서만 끄게 했다.
2. **UI는 변했는데 테스트는 그대로**: Pay를 누르면 결제수단 선택 화면이 먼저 나오도록 바뀌었는데, 테스트는 곧장 현금 입력 화면을 찾고 있었다.
3. **다른 컴퓨터의 AI 뇌에 스크린샷 저장**: 이건 좀 웃겼다.

   ```ts
   const SNAPSHOT_DIR = "/Users/someone/.gemini/antigravity/brain/5f3e…/screenshots/baseline";
   ```

   예전 맥북에서 다른 AI 도구가 쓰던 작업 폴더에 스크린샷을 저장하고 있었다. Linux에서는 당연히 `EACCES`가 났다. gitignore된 `test-results/`로 옮겼다.
4. **포커스 경합**: 검색 결과가 늦게 도착하면서 키보드 포커스 테스트를 흔들었다. 세 번 돌려 한 번 실패하는, 제일 얄미운 종류였다.

전부 고치고 두 번 연속 **87/87**. 타임아웃이 사라지니 실행 시간도 4.9분에서 1.3분으로 줄었다.

같은 날 발견한 보너스 버그도 있다. pos-api Dockerfile이 **이미 삭제된 파일**을 `COPY`하고 있었다. 다음 Coolify 배포에서 빌드가 깨질 뻔했다.

---

## 6. 문서 1만 줄 대청소

문서가 약 11,000줄이었다. 그중 상당수가 "Docker로 띄우세요", "Pay 버튼은 비활성입니다" 같은 이미 사실이 아닌 말을 하고 있었다.

그래서 문서에 적힌 **파일 경로, 링크, `pnpm` 스크립트, `deno task`가 실제로 존재하는지** 검사하는 작은 스크립트를 먼저 만들었다. "잘못된 정보"를 감이 아니라 숫자로 찾기 위해서다. 그 결과를 바탕으로 이렇게 정리했다.

- 완료된 계획, 리허설 보고서, 대체된 로드맵 10개는 `docs/archive/`로 옮기고 "당시 기록" 배너를 붙였다.
- 판매 원장 설계서는 "코드·DB 미구현"이라고 적혀 있었지만, 실제로는 판매·환불·교환이 전부 돌고 있었다. 현재 상태로 다시 썼다.
- 병합 사고로 7장이 제목부터 두 번씩 뒤섞여 있던 문단도 바로잡았다.

---

## 7. 재고 있는 상품을 먼저 보여줘

매장 직원 입장에서 나온 요청이었다.

> search results에 재고 있는 상품부터 먼저 보여주면 좋을 것 같아. 그리고 `2 options · check stock`… 이거 stock 보여줄 순 없나?

알고 보니 API는 **원래부터 옵션별 재고 합계를 내려주고 있었다.** 화면이 옵션이 2개 이상이면 숫자 대신 "check stock"이라고 쓰고 있었을 뿐이다. 추가 비용 0으로 `2 options · 7 in stock`이 됐다.

정렬은 실제로 재 봤다. 개발 DB에서 `EXPLAIN ANALYZE`를 돌렸다.

| 방식 | "mug" 검색 |
| --- | --- |
| 기존 이름순 | 58ms |
| 상품마다 `EXISTS`로 재고 확인 | **157ms** 😱 |
| 매장의 재고 상품 ID 집합을 한 번만 계산해 해시로 대조 | **67ms** 🎉 |

```sql
ORDER BY p.id IN (
  SELECT v.product_id FROM pos_catalog.variants v
  JOIN pos_inventory.stock_balances b ON b.variant_id = v.id
  WHERE b.balance > 0 AND b.account_id IN (…)
) DESC, p.name, p.id
```

쿼리 한 줄 모양만 바꿨는데 거의 공짜가 됐다. PostgreSQL이 `IN (subquery)`를 해시 서브플랜으로 한 번만 계산하기 때문이다.

---

## 8. 에이전트 삼총사

오늘은 코딩 에이전트를 여럿 섞어 썼다.

> pi agent가 있는데, 단순하고 반복적인 작업은 이 pi agent를 subagent로 사용해줘. 그럼 token 사용도 줄일 수 있을 것 같은데

그래서 반복 작업은 CLI 에이전트에게 맡기고, 설계와 돈이 오가는 코드는 Claude가 직접 쓰는 분업을 했다. 순서는 **agy → Codex → Pi → OpenCode**로 정했다.

- **Pi Agent** (로컬 Qwen): 카드 환불 차단 테스트 2개를 깔끔하게 써 왔다. 허용 범위를 살짝 넘어 가짜 DB에 3줄을 추가했는데, 그게 없으면 테스트가 성립하지 않았으니 정당한 월권이었다.
- **Codex**: HTTP 테스트 한 단계를 정확히 써 왔다.
- **agy**: 결과 JSON은 당당하게 `"status": "SUCCESS"`였다. 그런데 stderr에는 이렇게 적혀 있었다.

  ```
  a tool required the "command" permission that headless mode cannot prompt for, so it was auto-denied.
  ```

  **아무 파일도 바꾸지 않았다.** 헤드리스 에이전트의 성공 보고를 믿지 말고 `git diff`를 확인하라는 교훈을 온몸으로 보여줬다.

여러 에이전트를 동시에 돌려도 된다. 단, 서로 다른 파일을 맡겨야 한다. 한 파일을 두 에이전트가 동시에 고치면 누군가의 작업은 덮어써진다.

---

## 9. 홈랩에 PowerSync 세우기

운영 Coolify는 바깥 클라우드에 있다. 개발용은 집(홈랩)에서 돌리기로 했다.

```
pnpm powersync:dev up
  → 빌드 컨텍스트를 SSH로 원격 Docker(10.80.40.152)에 보내 그곳에서 빌드·실행
  → Zoraxy가 TLS 종료
      https://pos-dev.lab.example.net   → :28481
      https://powersync.lab.example.net → :28480
```

운영과 **같은 compose 파일**을 쓰고, 개발용 차이만 오버라이드로 덧붙였다. 첫 실행은 당연히(?) 실패했다.

```
Fatal startup error ... EISDIR: illegal operation on a directory, read
```

compose가 PowerSync 설정 파일을 `./powersync.yaml`로 bind mount하는데, 원격 Docker는 그 경로를 **원격 호스트에서** 찾는다. 파일이 없으니 Docker가 친절하게 빈 디렉터리를 만들어 줬고, PowerSync는 디렉터리를 설정 파일로 읽으려다 쓰러졌다. 설정 파일을 담은 작은 이미지를 원격에서 빌드하는 방식으로 바꿔 해결했다.

```yaml
pos-poc-powersync:
  build:
    context: .
    dockerfile_inline: |
      FROM journeyapps/powersync-service:1.26.1
      COPY powersync.yaml sync-rules.yaml /config/
  volumes: !reset []
```

### "외부에서 못 들어오는데 Basic Auth가 필요해?"

맞는 말이라 dev 오버라이드에서만 Basic Auth를 뺐다. 기기 등록 토큰과 캐셔 PIN은 남겼다. 이건 문지기가 아니라 앱 기능 자체다. 기기가 어느 계산대, 어느 매장에 속하는지가 이 흐름으로 정해지고, PowerSync 토큰도 그 매장 범위로 발급된다.

### 합성 데이터 말고 진짜 데이터로

처음엔 PoC 스크립트가 만든 **합성 상품 3만 개**가 들어 있었다.

> 왜 데이터가 db에 있는거랑 다른거야?

PowerSync는 Postgres **논리 복제**로 변경을 읽는데, 공유 Postgres는 `wal_level=replica`였다. 이걸 바꾸려면 재시작이 필요하다. 그래서 개발 DB를 직접 복제하기로 했다.

이 과정에서 두 가지를 챙겼다.

- **디스크**: 공유 Postgres 볼륨이 **총 4GB에 여유 2.6GB**였다. 복제 슬롯이 WAL을 무한정 붙잡으면 공유 서버가 통째로 멈출 수 있다. 처음 생각한 상한 2GB를 **512MB**로 낮췄다(`max_slot_wal_keep_size`).
- **권한 검사**: 공유 DB를 재시작하는 명령은 AI의 권한 검사에서 거부됐다. 우회하지 않고 스크립트로 만들어 내가 직접 실행했다. 조금 번거로웠지만, 공유 인프라를 재시작하는 버튼을 AI가 마음대로 누르지 못하는 건 오히려 안심되는 일이었다.

결과는 이랬다.

```
checkpoint_complete: data_synced_bytes=122,410,278
```

실제 카탈로그 약 122MB가 브라우저로 내려왔고, 검색하는 동안 **HTTP API 호출은 0건**이었다. 브라우저 SQLite에서 바로 검색됐다.

그런데 "thermocaf"로 검색한 결과가 전부 `0 in stock`이었다. 버그인가 싶어 DB를 직접 조회했다. 실제로 그 매장에는 해당 상품 재고가 하나도 없었다(재고 행 35,464개 중 양수는 617개). 코드가 정직했다.

---

## 10. 드디어 카드 결제 API

이 모든 준비 운동을 마치고 Phase 2를 만들었다. 설계의 핵심은 세 가지다.

1. **가격 스냅샷을 먼저 저장한다.** 결제 중에 가격이 바뀌어도 고객이 낸 금액 그대로 기록된다.
2. **판매 기록은 Stripe가 "성공"이라고 말한 뒤에만 만든다.**
3. **상태 조회가 곧 장애 복구다.** 응답을 잃어버려도 POST를 다시 보내지 않고 조회만 한다. 다시 보내면 PaymentIntent가 새로 생기기 때문이다.

제일 오래 고민한 건 이 부분이다.

```ts
if (isRetry && err instanceof StripeReaderError && err.reason === "busy") {
  // The earlier push most likely reached the reader and it is waiting for
  // (or reading) this card: never cancel under the customer's hand.
}
```

네트워크 오류 뒤에 단말기로 다시 보냈는데 "바쁨"이 오면, 그건 **앞서 보낸 요청이 도착해서 고객이 지금 카드를 대고 있다**는 뜻일 수 있다. 이때 취소하면 고객 손 밑에서 결제를 끊는 셈이다. 그래서 재전송일 때의 "바쁨"은 "이미 전달됨"으로 처리한다.

### 테스트가 테스트의 버그를 잡았다

가짜 Stripe로 시나리오 11개를 짰다. 첫 실행 결과는 1개 통과, 10개 실패였다.

```
duplicate key value violates unique constraint "card_payment_attempts_stripe_payment_intent_id_key"
```

가짜 Stripe 인스턴스마다 PaymentIntent ID를 `pi_fake1`부터 발급하고 있었다. 그리고 DB는 PaymentIntent ID에 UNIQUE 제약이 있다. **내가 넣은 안전장치가 내가 쓴 테스트의 버그를 잡은 것이다.** 실제 Stripe처럼 전역 고유 ID를 내도록 고치자 11개 모두 초록불이 됐다.

---

## 11. 단말기는 시드니에, 개발자는 서울에

마지막 질문이 제일 현실적이었다.

> stripe 단말기가 호주에 있고, 나는 지금 한국에서 개발 작업을 하고 있어. 어떻게 하지?

server-driven 구조의 진가가 여기서 나왔다. pos-api가 Stripe API를 부르고 단말기는 매장 인터넷으로 Stripe와 통신하니, **개발자가 어디 있든 상관없다.**

- **지금**: Stripe 테스트 모드의 **시뮬레이션 WisePOS E**(`simulated-wpe`)를 쓴다. 테스트 헬퍼 `presentPaymentMethod`가 "고객이 카드를 댔다"를 흉내 내 준다. `4242…`는 승인, `4000000000009995`는 거절이다.
- **나중에 한 번**: 서울에서 키오스크의 Card를 누르면 시드니 매장 단말기에 금액이 뜨고, 현지 직원이 eftpos 테스트 카드를 댄다. 영상통화 30분이면 된다. 시드니와 서울은 한두 시간 차이라 일정 잡기도 쉽다.

---

## 마치며

| 항목 | 아침 | 저녁 |
| --- | --- | --- |
| 키오스크 E2E | 72 통과 / **15 실패** | **87 / 87** |
| E2E 실행 시간 | 4.9분 | 1.3분 |
| CI의 POS DB 테스트 | 카탈로그 1종 | 카탈로그·판매·카드·HTTP·인증 + 큐 통합 |
| 개발 PowerSync 데이터 | 없음 | 실제 카탈로그 122MB 실시간 복제 |
| 카드 결제 | 계획도 없음 | API + 시나리오 11개 |

오늘 배운 것을 적어 두면:

- **"잠깐 이것만"은 거짓말이다.** 하지만 제대로 파고들면 그 과정에서 숨어 있던 버그가 줄줄이 나온다.
- **헤드리스 에이전트의 SUCCESS를 믿지 말고 diff를 봐라.**
- **안전장치는 가끔 나를 구한다.** UNIQUE 제약은 테스트 버그를 잡았고, 권한 검사는 공유 DB 재시작을 멈춰 세웠다.
- **측정해라.** 157ms와 67ms의 차이는 쿼리 한 줄 모양이었다.
- **실행 위치를 확인해라.** 원격 Docker의 bind mount는 원격 호스트 기준이고, act 이미지에는 `psql`이 없다.

다음은 키오스크 카드 결제 화면이다. 시뮬레이션 단말기로 서울에서 "삑" 소리를 들어볼 차례다. 🇰🇷 ⇄ 🇦🇺
