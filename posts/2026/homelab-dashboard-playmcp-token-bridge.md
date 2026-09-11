---
title: "홈랩 대시보드 고도화: PlayMCP 3중 토큰 브릿지 실전 탑재와 Ollama 실시간 로컬 브리핑 완성기"
date: "2026-09-10"
tags: ["homelab", "playmcp", "ollama", "docker", "kakao", "automation"]
summary: "로컬 AI에서 검증한 PlayMCP 무한 토큰 브릿지를 24/7 홈랩 대시보드 컨테이너에 올리며 겪은 Docker 권한 충돌, 토큰 파일 우선순위, 카카오맵 마크다운 파서 리팩토링, Ollama gemma4 토큰 헤드룸 튜닝 기록"
---

어제
글([카카오 PlayMCP 연동기: 12시간 토큰 만료와 데몬 버그를 극복한 3중 무중단 아키텍처](https://iceship.dev/blog/kakao-playmcp-infinite-token-bridge))에서
로컬 Mac 터미널 환경을 위한 무한 토큰 브릿지(`playmcp-bridge.js`)를 다뤘다.

로컬 개발 환경에서 성공했으니, 다음 목표는 명확했다: **"24시간 365일 돌아가는
홈랩 통합 대시보드(`homelab-dashboard`) 서비스에 이 브릿지를 완전히 내장하여,
매일 아침 카카오톡 나와의 채팅방(MemoChat)과 Discord로 실시간 동네 스팟이 담긴
모닝 브리핑을 자동 전송하는 것."**

하지만 로컬 PoC 코드를 도커 컨테이너와 프로덕션 환경으로 옮기는 과정은 언제나
만만치 않았다. 비루트(non-root) 컨테이너 권한 충돌부터 토큰 파일 덮어쓰기
레이스, 카카오맵의 예외적인 마크다운 포맷, 그리고 로컬 LLM의 사고 과정(Thinking)
토큰 잠식까지, 오늘 하루 동안 맞닥뜨리고 해결한 5가지 실전 트러블슈팅을
정리한다.

---

## 1. 아키텍처: 맥북과 서버의 '완전 격리' 원칙

가장 먼저 세운 원칙은 **"맥북의 로컬 `mcporter` 환경은 절대 건드리지
않는다"**였다.

카카오 OAuth2 토큰 엔드포인트(`playauth.kakao.com`)는 `grant_type=refresh_token`
요청 시 기존 Refresh Token을 폐기하고 새로운 Refresh Token을 즉시 발급하는
**토큰 로테이션(Token Rotation)** 방식을 사용한다.

만약 개발용 맥북과 홈랩 서버 컨테이너가 같은 토큰을 공유하면, 한쪽에서 토큰을
갱신하는 순간 반대쪽은 즉시 `401 Unauthorized (invalid_grant)` 에러를 맞고
세션이 끊어진다.
![홈랩 대시보드 PlayMCP 3중 무중단 토큰 브릿지 및 모닝 브리핑 아키텍처](/images/blog/homelab-dashboard-playmcp-bridge.svg)

[아키텍처 구조도 크게 보기](/images/blog/homelab-dashboard-playmcp-bridge.svg)

- **서버 독립 OTT 교환기 탑재**: 대시보드 내에 `POST /api/kakao/token`
  엔드포인트를 구현하여, PlayMCP 웹에서 발급받은 1회용 토큰(OTT)을 대시보드
  UI에서 입력하면 서버가 직접 카카오 API와 교환하여 전용 토큰을 저장하도록
  설계했다.
- **3중 방어선 구현**:
  1. 4시간 주기 백그라운드 자동 회전 루프 (Tier 1)
  2. 도구 호출 전 만료 2시간 전 선제적 온더플라이 갱신 (Tier 2)
  3. 401 발생 시 즉각 회전 후 단 1회 무중단 재시도 (Tier 3)

---

## 2. 삽질 1: Docker 볼륨 권한과 비루트 사용자(UID 1993)

토큰 교환 엔드포인트를 붙이고 테스트를 실행하자마자 첫 번째 에러가 터졌다:

```text
os error 13: Permission denied (os error 13)
at Object.writeTextFile (ext:deno_fs/30_fs.js)
at persistPlayMcpTokens (src/playmcp.ts)
```

### 원인 분석

Deno 공식 도커 이미지는 보안을 위해 루트가 아닌 `deno` 사용자(**UID 1993, GID
1993**)로 컨테이너를 실행한다. 하지만 호스트 머신(`docker-01`)에 마운트한 영구
디렉토리(`/var/lib/homelab/dashboard-data`)가 `root:root (0:0)` 권한으로
생성되어 있어, 컨테이너 프로세스가 토큰 JSON 파일을 쓸 수 없었던 것이다.

### 해결책

호스트 디렉터리의 소유권을 컨테이너 내부 사용자의 UID에 맞춰 조정했다:

```bash
# 호스트(LXC)에서 도커 비루트 사용자에 맞게 소유권 이전
mkdir -p /var/lib/homelab/dashboard-data
chown -R 1993:1993 /var/lib/homelab/dashboard-data
chmod 700 /var/lib/homelab/dashboard-data
```

그리고 `compose.yml`에서 볼륨 경로를 호스트의 영구 디렉터리로 바인드 마운트했다:

```yaml
services:
  dashboard:
    image: homelab-dashboard:latest
    container_name: homelab-dashboard
    restart: unless-stopped
    volumes:
      - /var/lib/homelab/dashboard-data:/app/data
    environment:
      PLAYMCP_TOKENS_PATH: "/app/data/playmcp_tokens.json"
```

이제 새 커밋 배포로 컨테이너가 파괴되고 새로 떠도,
`/app/data/playmcp_tokens.json`에 저장된 최신 토큰 상태가 유실되지 않는다.

---

## 3. 삽질 2: 환경변수 vs 디스크 파일 (토큰 덮어쓰기 버그)

권한 문제를 해결하고 OTT를 교환했는데, 몇 시간 뒤 다시 `401 Unauthorized` 에러가
발생했다.

### 원인 분석

컨테이너 실행 시 Portainer 스택 환경변수로 주입되었던 초기
`PLAYMCP_REFRESH_TOKEN`이 문제였다.

```typescript
// 버그가 있던 기존 로딩 로직
export async function loadPlayMcpTokens(): Promise<PlayMcpTokens | null> {
  const envRefreshToken = Deno.env.get("PLAYMCP_REFRESH_TOKEN");
  if (envRefreshToken) {
    // 환경변수가 있으면 디스크 파일보다 우선함 <- 문제의 원인!
    return { refreshToken: envRefreshToken, ... };
  }
  return await readTokenFile();
}
```

백그라운드 루프나 API 호출이 카카오 서버로부터 새로운 Refresh Token을 받아와
파일(`/app/data/playmcp_tokens.json`)에 정상적으로 저장해 두었음에도 불구하고,
컨테이너 프로세스가 재시작되거나 모듈을 다시 읽을 때 **스택에 박혀 있던 '이미
만료되어 폐기된 옛날 환경변수 토큰'**을 먼저 읽어버린 것이다.

### 해결책

디스크 파일 저장소를 **단일 진실 공급원(Single Source of Truth)**으로 확정했다:

```typescript
export async function loadPlayMcpTokens(): Promise<PlayMcpTokens | null> {
  // 1. 디스크에 영구 보관된 토큰 파일 최우선 참조
  const fileTokens = await readTokenFile(tokenPath);
  if (fileTokens?.refreshToken) {
    return fileTokens;
  }

  // 2. 파일이 아예 없을 때만 환경변수를 초기 부트스트랩 시드로 사용
  const envRefreshToken = Deno.env.get("PLAYMCP_REFRESH_TOKEN");
  if (envRefreshToken) {
    return { accessToken: "", refreshToken: envRefreshToken, ... };
  }

  return null;
}
```

이 수정으로 환경변수에 남은 낡은 시드가 갱신된 파일 토큰을 덮어쓰는 문제가
완전히 사라졌다.

---

## 4. 삽질 3: 카카오맵 마크다운 파서와 "자세히 보기"의 함정

토큰 브릿지가 완벽하게 돌아가자, 이제 브리핑에 들어갈 실시간 동네 장소를
카카오맵 MCP(`KakaoMap-SearchPlaceByKeywordOpen`)로 조회하기 시작했다.

그런데 생성된 카카오톡 메시지에 이상한 텍스트가 찍혀 나왔다:

```text
🌅 [모닝브리핑] 2026-09-10 (목요일)
...
🍜 추천: 자세히 보기 (판교역 인근)
📍 http://place.map.kakao.com/1035471214
```

추천 식당 이름이 **"자세히 보기"**로 나오는 황당한 현상이었다.

### 원인 분석

PlayMCP의 카카오맵 도구는 JSON이 아니라 아래와 같은 마크다운 포맷으로 응답을
돌려준다:

```markdown
판교동 점심 맛집 검색 결과

1. 추오정남원추어탕 판교점

- 주소: 성남시 분당구 대왕판교로 637
- 카테고리: 음식점 > 한식 > 해물,생선 > 추어
- [자세히 보기](http://place.map.kakao.com/1035471214)

2. 힘찬장어

- 주소: 성남시 분당구 판교로502번길 13
- 카테고리: 음식점 > 한식 > 해물,생선 > 장어
- [자세히 보기](http://place.map.kakao.com/27594837)
```

기존 파서는 단순히 텍스트 내의 모든 마크다운 링크(`\[(.*?)\]\((.*?)\)`)를 긁어와
첫 번째 그룹을 매장명으로 인식하도록 짜여 있었다. 그 결과, 각 매장 끝에 붙어
있던 `[자세히 보기](http://place.map.kakao.com/...)` 링크의 텍스트인 **"자세히
보기"**를 매장 이름으로 낚아채 버린 것이다!

### 해결책: 줄 단위(Line-by-line) 구조적 파서로 전면 개편

```typescript
const GENERIC_LINK_REGEX =
  /^(?:자세히\s*보기|상세보기|지도보기|길찾기|카카오맵|바로가기|더보기)$/i;

// 1. 번호 매김 헤더 ("1. 매장명", "1. **매장명**", "1. [매장명](url)")
const headingMatch = l.match(/^(?:[0-9]+\.|\*|\-)\s+(.+)$/);
const isSubProperty =
  /^(?:-|\*)\s*(?:주소|위치|도로명|카테고리|분류|업종|전화|\[?(?:자세히\s*보기|상세보기))/i
    .test(l);

if (headingMatch && (!l.startsWith("-") || !isSubProperty)) {
  flushCurrentPlace();
  let rawName = headingMatch[1].replace(/^[*_~]+|[*_~]+$/g, "").trim();
  currentPlace = { name: rawName };
  continue;
}

// 2. 하위 속성 파싱
if (currentPlace) {
  if (l.includes("map.kakao.com")) {
    const urlMatch = l.match(
      /(https?:\/\/(?:place\.)?map\.kakao\.com\/[^\s)]+)/,
    );
    if (urlMatch) currentPlace.url = urlMatch[1];
  }
  if (/주소:|도로명:/.test(l)) {
    currentPlace.address = l.replace(/^(?:-|\*)?\s*(?:주소|도로명):\s*/, "")
      .trim();
  } else if (/카테고리:|분류:|업종:/.test(l)) {
    currentPlace.category = l.replace(
      /^(?:-|\*)?\s*(?:카테고리|분류|업종):\s*/,
      "",
    ).trim();
  }
}
```

또한 파싱된 매장명이 `GENERIC_LINK_REGEX`에 걸리면 결과에 추가하지 않도록 2중
방어막을 구축했다.

---

## 5. 삽질 4: POI 검색 키워드와 아파트 단지명의 한계

파서를 고치고 나서 다시 검색을 돌려보니 이번엔 `places.length === 0`이 뜨면서
스팟이 아예 잡히지 않았다.

### 원인 분석

검색어로 넘기던 키워드가 문제였다:

- 검색 시도 키워드: `판교 삼평동 아파트단지명 점심 맛집`,
  `판교특정아파트 순대국`
- 카카오맵 응답:
  `"해당 검색어의 장소를 찾을 수 없습니다. 다른 키워드로 시도해보세요."`

카카오맵 장소 검색 API는 네이버 지도나 카카오맵 앱의 자연어 검색과 달리,
**POI(Point of Interest) 키워드 매칭** 방식을 사용한다. 아파트 단지명은 POI
검색에서 상권이나 카테고리 태그가 아니므로, 모든 토큰을 교집합으로 찾으려다 보니
검색 결과가 0건으로 떨어진 것이었다.

### 해결책: 거주지 생활권 기반의 다단계(Multi-tier) 검색

사용자 거주지 생활권(성남시 분당구 판교역로 일대)에 맞춰, 행정동과 주요 도로명
중심의 3단계 폴백 검색 쿼리를 구성했다:

```typescript
// 거주지 중심 반경 500m~1km 생활권 쿼리
const searchQueries = [
  `판교동 ${queryCategory}`, // 1순위: 행정동 중심 상권
  `판교역로 ${queryCategory}`, // 2순위: 도보 대로변 상권
  `판교역 ${queryCategory}`, // 3순위: 인근 역세권 중심 상권
];

for (const keyword of searchQueries) {
  const places = await searchKakaoMapPlaces(keyword);
  if (places.length > 0) {
    // 실제 도로명 주소를 파싱하여 도보 시간 동적 산출
    let walkTime = "판교역 인근";
    if (
      chosen.address.includes("판교역로 3") ||
      chosen.address.includes("판교역로 4")
    ) {
      walkTime = "도보 5분 이내 (판교역로)";
    } else if (chosen.address.includes("대왕판교로")) {
      walkTime = "도보 10~15분 (대왕판교로 방면)";
    }
    return { ...chosen, walkTime };
  }
}
```

이제 날씨가 쌀쌀할 때는 `판교동 순대국`을 찾아 판교역로 46의 **판교순대국**(도보
5분)을 잡고, 맑은 날에는 `판교역로 맛집`을 찾아 판교역로 31의
**한판닭갈비**(도보 3분)나 대왕판교로의 디저트 카페를 자연스럽게 발굴해낸다.

---

## 6. 삽질 5: Ollama gemma4의 사고 과정(Thinking)과 문장 잘림

마지막 복병은 로컬 LLM 추론 엔진(`gemma4:e2b-it-qat` on LXC 550 / AMD ROCm 780M
iGPU)에서 터졌다.

디스코드와 대시보드 웹에 찍힌 브리핑 문장이 매번 마지막 문단 중간에서 뚝 끊겨
있었다:

> "...시스템 관리는 제가 든든하게 책임지고 있으니, 사용자님께서는 오늘 하루
> 야..." ✂️ (중단)

### 원인 분석

Ollama API 응답 메타데이터를 확인해보니 범인은 `done_reason: "length"`였다:

```json
{
  "eval_count": 800,
  "done_reason": "length"
}
```

`gemma4`는 심층 추론(Reasoning) 모델이라, 최종 답변을 작성하기 전에 내부적으로
사고 과정(`thinking`)을 먼저 전개한다.

문제는 Ollama 옵션의 `num_predict: 800`이 **'사고 과정 토큰'과 '최종 본문
토큰'의 합계**에 적용된다는 점이었다. 모델이 혼자 머릿속으로 약 500토큰 분량의
영어 사고 과정을 펼치고 나니, 정작 한국어 브리핑 본문을 쓰기 위한 잔여 토큰이
300토큰밖에 남지 않아 문장 도중에 800 한도에 부딪혀 강제 종료되었던 것이다.

### 해결책

1. **토큰 헤드룸 대폭 상향**: `num_predict`를 `800`에서 `2048`로 상향 조정하여
   사고 과정(약 500토큰)과 정갈한 3문단 한국어 본문(약 500~600토큰)을 모두 담을
   수 있도록 여유를 확보했다.
2. **프롬프트 가이드라인 보강**: 사고 과정 태그를 본문에 남기지 않도록 지침을
   추가하고, 코드 레벨에서 혹시 모를 `<think>...</think>` 태그를 정규식으로
   정제했다.

```typescript
const res = await fetch(`${ollamaUrl}/api/chat`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gemma4:e2b-it-qat",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    options: {
      temperature: 0.3,
      num_predict: 2048, // 800 -> 2048로 충분한 헤드룸 제공
    },
  }),
});

const resData = await res.json();
const rawContent = resData.message?.content || "";
const briefingText = rawContent
  .replace(/<think>[\s\S]*?<\/think>/gi, "")
  .replace(/<thought>[\s\S]*?<\/thought>/gi, "")
  .trim();
```

---

## 7. 최종 결과: 완벽한 실시간 일일 모닝 브리핑

모든 트러블슈팅을 마친 뒤, 대시보드에서 `POST /api/ai/briefing`을 호출해
실서비스 E2E 테스트를 진행했다.

### 📱 카카오톡 나와의 채팅방 수신 (200자 압축 포맷)

스마트폰 카카오톡 알림으로 즉시 도착한 브리핑이다:

```text
🌅 [모닝브리핑] 2026-09-10 (목요일)
🌤️ 판교동 날씨: 17.9°C (흐림, 체감 18.6°C)
💾 인프라: PBS 백업 100% (15건) · 노드 4/4
🍜 추천: 온안 (도보 10~15분 (대왕판교로))
📍 http://place.map.kakao.com/678962534
```

카카오맵 링크를 누르면 스마트폰의 카카오맵 앱이 바로 열리며 매장 상세 정보와
도보 길찾기로 이어진다.

### 💬 Discord 채널 및 대시보드 본문 (Ollama 3문단 완성본)

문장 끊김 없이 완벽하게 완결된 3문단 브리핑이 Discord Sunrise 임베드로 도착했다:

> **[홈랩] 일일 아침 브리핑 · 2026-09-10 (목요일)**\
> \
> 안녕하세요! 2026년 9월 10일 목요일, 상쾌한 하루를 시작할 시간입니다. 현재
> 분당구 판교동의 날씨는 흐리지만, 기온은 17.9°C로 쾌적하며 습도도 62%로
> 적당합니다. 공기질 지수도 미세먼지 14µg/m³로 매우 깨끗하여 오늘 하루 야외
> 활동에도 걱정 없으시겠어요. 실내 환경은 거실과 안방 에어컨 덕분에 쾌적하게
> 유지되고 있으며, 모든 시스템이 안정적으로 작동하고 있음을 확인했습니다.\
> \
> 홈랩 인프라 현황도 아주 좋습니다! Proxmox 4개 노드가 모두 정상 가동 중이며,
> 새벽 백업 작업 15건 모두 100% 성공하여 데이터 안전성까지 완벽하게
> 확보했습니다. 주요 서비스 21개 모두 정상 작동 중이니, 기술적인 부분은
> 안심하셔도 됩니다. 시스템이 든든하게 준비된 오늘, 사용자님은 그동안 계획하셨던
> 일들에 집중하며 활기찬 하루를 시작하시길 응원합니다.\
> \
> 오늘 하루를 더욱 기분 좋게 시작할 수 있는 작은 쉼표를 추천해 드립니다. 판교역
> 인근에는 도보 10~15분 거리에 위치한 '온안'이라는 곳이 있는데, 상쾌한 아침을
> 깨워줄 모닝 커피와 맛있는 디저트를 즐기기에 완벽한 카페입니다. 잠시 여유를
> 가지며 맛있는 커피 한 잔과 함께 오늘 하루를 위한 에너지를 충전해 보세요. 멋진
> 하루 보내세요!

---

## 8. 마치며: PoC에서 프로덕션으로 가는 길

로컬 터미널에서 스크립트 하나로 돌아가던 프로토타입을 실제 24시간 가동되는
컨테이너 인프라로 안착시키는 과정은 언제나 수많은 디테일을 요구한다:

1. **컨테이너 보안과 권한**: 비루트 유저 컨테이너 환경에서는 호스트 볼륨
   소유권(UID/GID)을 선제적으로 설계해야 한다.
2. **토큰 라이프사이클의 우선순위**: 런타임에 자체 갱신되는 토큰 시스템이라면,
   고정된 환경변수가 아닌 디스크 상태 파일을 단일 진실 공급원으로 삼아야 한다.
3. **외부 API의 포맷 방어**: 마크다운 기반의 LLM/MCP 도구 출력은 링크 텍스트,
   번호 매김, 메타 헤더 등 다양한 노이즈가 섞일 수 있으므로 철저한 줄 단위 검증
   파서가 필수적이다.
4. **추론 LLM의 토큰 헤드룸**: 사고 과정(Thinking)을 출력하는 모델을 사용할 때는
   최종 본문 길이뿐만 아니라 생각 과정이 소모하는 토큰 풀을 반드시 사전에 계산에
   넣어야 한다.

이제 매일 아침 06:30, Semaphore 크론이 돌 때마다 우리 집 홈랩 비서는 안심할 수
있는 인프라 현황과 오늘 날씨에 딱 맞는 따뜻한 동네 밥집을 내 폰으로 배달해 줄
것이다.
