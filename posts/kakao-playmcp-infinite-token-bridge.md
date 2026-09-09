---
title: "카카오 PlayMCP 연동기: 12시간 토큰 만료와 데몬 버그를 극복한 3중 무중단 아키텍처"
date: "2026-09-09"
summary: "카카오 PlayMCP(카카오맵, 네이버 검색, 나챗방)를 AI 에이전트에 연동하며 겪은 12시간 토큰 만료와 mcporter 데몬 증발 버그를 분석하고, 토큰 로테이션과 독립 브릿지로 영구 무중단 환경을 구축한 기록"
tags: ["playmcp", "mcp", "kakao", "ai-agent", "automation"]
---

카카오에서 제공하는 MCP 게이트웨이 서비스인 **PlayMCP**를 AI 코딩
에이전트(Antigravity / Gemini CLI)에 연동하여 카카오맵 장소 검색, 네이버 실시간
검색, 그리고 카카오톡 나와의 채팅방(MemoChat) 전송 파이프라인을 구축했다.

하지만 운영 과정에서 **12시간 Access Token 만료**와 공식 CLI 도구인
`mcporter daemon`의 **15분 유휴 만료(`Config view expired`) 및 토큰 증발
버그**를 맞닥뜨렸다. 이를 해결하기 위해 카카오의 **OAuth2 토큰 로테이션(Token
Rotation)** 메커니즘을 규명하고, 데몬을 거치지 않는 **독립 Stdio
브릿지(`playmcp-bridge.js`)**와 **6시간 주기 백그라운드 크론**을 결합하여 영구
무중단 3중 안전 시스템을 완성한 과정을 정리한다.

---

## 1. 배경: AI 에이전트에 왜 한국 로컬 MCP가 필요했을까?

AI 에이전트를 터미널과 로컬 개발 환경의 데일리 어시스턴트로 활용하다 보면 항상
아쉬운 지점이 하나 있다. 바로 **"한국 로컬 실시간 데이터"**와 **"모바일
알림/메모 전송"**의 부재다.

- **장소/맛집 검색의 한계**: 글로벌 LLM 검색은 한국의 동네 단위 상권(예: 인근
  골목 식당)에 대한 최신 정보나 정확한 카카오맵 링크를 제공하지 못한다.
- **결과 활용의 단절**: 터미널에서 찾은 유용한 링크나 추천 장소를 스마트폰으로
  가져가려면 복사해서 메신저로 직접 보내야 하는 번거로움이 있었다.

이때 카카오가 공개한 **PlayMCP(`playmcp.kakao.com`)**는 완벽한 해결책처럼
보였다:

1. **카카오맵 MCP**: 키워드 기반 POI 검색, 대중교통/도보/자전거 길찾기, 카카오맵
   상세 링크 제공
2. **네이버 검색 MCP**: 네이버 블로그, 뉴스, 카페, 지역 업체, 데이터랩
   쇼핑/검색어 트렌드 분석
3. **카카오톡 나와의 채팅방(MemoChat)**: 결과 텍스트와 링크를 내 카카오톡
   나챗방으로 원클릭 다이렉트 전송

---

## 2. 연동 방식 분석과 함정

PlayMCP 도구함에서는 Claude, ChatGPT, OpenClaw 등 몇 가지 연결 옵션을 안내한다.

| 연결 방식                 | 구조                                              | 한계점                                           |
| :------------------------ | :------------------------------------------------ | :----------------------------------------------- |
| **Claude.ai 연결**        | Claude 웹 커넥터 디렉토리 OAuth 연동              | Claude Pro/Team 유료 구독 필수, 웹 브라우저 한정 |
| **ChatGPT 연결**          | ChatGPT Apps & Connectors 커스텀 등록             | ChatGPT Plus 유료 구독 필수, Unsafe 경고 발생    |
| **OpenClaw (`mcporter`)** | 카카오 공식 지원 CLI를 통한 원타임 토큰(OTT) 교환 | 로컬 터미널 및 모든 AI 에이전트 연동 가능 (무료) |

현재 사용 중인 **Antigravity (Gemini CLI)** 환경에서는 로컬 터미널에서 도구를
호출해야 하므로, 당연히 **OpenClaw (`mcporter`) 방식**이 가장 적합했다.

### 함정 1: 12시간 Access Token 만료

PlayMCP 게이트웨이 엔드포인트(`https://playmcp.kakao.com/mcp`)는 OAuth2 Bearer
인증을 요구한다. 초기에 `~/.gemini/config/mcp_config.json`에 정적
헤더(`Authorization: Bearer <token>`)로 등록했을 때, 당일에는 완벽히 동작하다가
**정확히 12시간 뒤에 401 Unauthorized 오류**를 뿜으며 먹통이 되었다.

카카오 인증 서버가 발급하는 Access Token의 유효기간(`exp`)이
12시간(43,200초)으로 고정되어 있기 때문이었다.

### 함정 2: `mcporter daemon`의 15분 유휴 세션 증발 버그

이를 막기 위해 `mcporter`를 설치하고 `mcporter serve --stdio`로 로컬 Stdio
서버를 띄웠다. `mcporter`는 90일짜리 Refresh Token을 저장하고 있으므로 만료 시
자동 갱신해 줄 것으로 기대했다.

그러나 15분 정도 아무런 요청을 보내지 않다가 도구를 호출하면 충격적인 에러가
발생했다:

```text
Error: calling "tools/call": Config view expired; register before a new operation.
```

소스 코드를 디컴파일해 추적한 결과는 다음과 같았다:

- `mcporter serve --stdio`는 내부적으로 백그라운드 소켓
  데몬(`mcporter daemon`)과 통신한다.
- 데몬 코드(`broker.js`)에 하드코딩된 **15분 유휴
  타이머**(`expireViews: 15 * 60_000`)가 존재한다.
- 15분 동안 도구 호출이 없으면 데몬이 클라이언트 세션(View)을 강제로 폐기한다.
- 세션이 폐기된 상태에서 요청이 들어오면 에러를 던지고, 비대화형 환경에서
  난데없이 브라우저 OAuth 로그인을 시도하다가 **`credentials.json`에 저장된 정상
  토큰을 통째로 삭제(Wipe)**해 버리는 치명적인 버그가 있었다.

---

## 3. 원리 규명: 카카오 OAuth2 토큰 회전(Token Rotation)

이 문제를 근본적으로 해결하기 위해 카카오 PlayMCP의 OAuth 엔드포인트를 직접
분석했다.

### 1) One Time Token(OTT) 교환 API

사용자가 PlayMCP 도구함 웹에서 생성한 1회용 토큰은 다음 엔드포인트로 교환된다:

```bash
curl -s -X POST 'https://playmcp.kakao.com/api/v1/auths/otts:exchange' \
  -H 'Content-Type: application/json' \
  -d '{"tokenValue":"<ONE_TIME_TOKEN>"}'
```

응답으로 12시간 유효한 `accessToken`과 90일 유효한 `refreshToken`이 반환된다.

### 2) 토큰 갱신과 무한 로테이션의 발견

핵심은 Refresh Token으로 토큰을 갱신하는 엔드포인트였다:

```bash
curl -s -X POST 'https://playauth.kakao.com/playmcp/oauth2/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'grant_type=refresh_token&client_id=<PLAYMCP_CLIENT_ID>&refresh_token=<REFRESH_TOKEN>'
```

요청을 보내자 놀라운 결과가 내려왔다:

```json
{
  "access_token": "eyJraWQiOi...",
  "refresh_token": "<ROTATED_NEW_REFRESH_TOKEN>...",
  "scope": "default",
  "token_type": "Bearer",
  "expires_in": 43199
}
```

카카오 인증 서버는 단순히 Access Token만 연장해 주는 것이 아니라, **새로운
Refresh Token을 교체 발급(Token Rotation)**해 주었다. 즉, 90일 만료일이 다가오기
전에 주기적으로 갱신하기만 하면 **90일 카운트다운이 매번 0으로 리셋되어
영구적으로 만료되지 않는 구조**였다!

---

## 4. 3중 무중단 영구 유지 아키텍처 설계

결함이 있는 `mcporter daemon`을 완전히 걷어내고, 토큰 로테이션을 자동화하는
3계층 아키텍처를 직접 구축했다.

![AI 에이전트, 독립 브릿지, 토큰 갱신 스크립트와 6시간 주기 크론을 연결한 PlayMCP 구조](/images/blog/kakao-playmcp-token-bridge.svg?v=2)

[흐름도 크게 보기](/images/blog/kakao-playmcp-token-bridge.svg?v=2)

### 계층 1: 토큰 회전 갱신 스크립트 (`refresh-token.sh`)

Kakao OAuth2 토큰 엔드포인트와 통신하여 새 Access Token과 회전된 Refresh Token을
받아 `credentials.json`에 원자적으로 저장하는 쉘 스크립트를 작성했다:

```bash
#!/usr/bin/env bash
# ~/.mcporter/refresh-token.sh
set -euo pipefail

node -e '
const fs = require("fs");
const credPath = process.env.HOME + "/.mcporter/credentials.json";
const creds = JSON.parse(fs.readFileSync(credPath, "utf8"));
const key = Object.keys(creds.entries || {}).find(k => k.startsWith("mcp-gateway"));
const entry = creds.entries?.[key];
if (!entry) process.exit(0);

async function refresh() {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: entry.clientInfo?.client_id || "<PLAYMCP_CLIENT_ID>",
    refresh_token: entry.tokens.refresh_token
  });

  const res = await fetch("https://playauth.kakao.com/playmcp/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const data = await res.json();
  entry.tokens.access_token = data.access_token;
  if (data.refresh_token) entry.tokens.refresh_token = data.refresh_token;
  entry.updatedAt = new Date().toISOString();
  fs.writeFileSync(credPath, JSON.stringify(creds, null, 2));
}
refresh();
'
```

### 계층 2: 무중단 독립 Stdio 브릿지 (`playmcp-bridge.js`)

버그가 있던 `mcporter daemon` 소켓을 우회하고, Antigravity와 PlayMCP 사이에서
완벽하게 표준 MCP 프로토콜을 중계하는 경량 브릿지를 Node.js로 작성했다:

- **15분 유휴 만료 없음**: 데몬 프로세스를 거치지 않고 개별 호출을 독립 격리
  처리하여 1초 미만으로 응답
- **온더플라이 사전 갱신**: 도구 호출 시 JWT 페이로드를 검사해 토큰 만료가 2시간
  미만으로 남았거나 401 에러가 발생하면 즉시 `refresh-token.sh`를 실행해 토큰을
  갈아 끼운 뒤 재시도

이 브릿지를 `~/.gemini/config/mcp_config.json`에 직접 등록했다:

```json
{
  "mcpServers": {
    "playmcp": {
      "command": "/path/to/.mcporter/playmcp-bridge.js"
    }
  }
}
```

### 계층 3: 6시간 주기 백그라운드 크론(Cron)

Mac이 켜져 있는 동안 장기간 도구를 사용하지 않더라도 Refresh Token의 90일 만료
시한이 도래하지 않도록, `crontab`에 6시간 단위 자동 실행을 등록했다:

```bash
0 */6 * * * ~/.mcporter/refresh-token.sh >> ~/.mcporter/refresh.log 2>&1
```

---

## 5. 실전 검증: 집 근처 저녁 메뉴 추천 & 나챗방 전송

모든 구성이 완료된 후, 실제로 AI 에이전트에게 저녁 메뉴 추천을 요청해 보았다:

> **사용자 요청**: _"집근처 오늘 추천 저녁 메뉴 찾아서 나챗방에 보내줘"_

1. 에이전트가 `playmcp`의 `KakaoMap-SearchPlaceByKeywordOpen` 도구를 호출하여 집
   인근 맛집들을 즉각 검색했다.
2. 도보 2분 거리의 철판 닭갈비(`한판닭갈비`), 일본식 수제
   라멘(`신짱과후쿠마루`), 정갈한 한식(`다밀`) 3곳을 선정했다.
3. `KakaotalkChat-MemoChat` 도구를 호출하여 1초 만에 스마트폰 카카오톡 **나와의
   채팅방**으로 요약 내용과 지도 링크를 발송 완료했다.

---

## 6. 에이전트 행동 가드레일 학습 (/learn)

이번 작업 과정에서 한 가지 소소하지만 중요한 교훈을 얻었다.

에이전트가 카카오톡 나챗방 메시지의 200자 제한을 검증하겠다고 불필요하게
`python3 -c "print(len(...))"` 스크립트를 실행하려다 사용자에게 터미널 권한 승인
팝업을 띄운 일이 있었다.

이를 계기로 `/learn` 슬래시 커맨드를 실행하여 에이전트 전역
규칙(`~/.gemini/GEMINI.md`)에 다음 가드레일을 영구 반영했다:

> **도구 호출 컨벤션 가드레일**:\
> 글자 수 계산이나 사소한 텍스트 포맷팅 작업에 bash/python 스크립트를 실행해
> 승인 팝업을 띄우지 말고, PlayMCP MCP 도구를 즉시 직접 호출할 것.

---

## 7. 마치며: 외부 MCP 연동의 핵심은 '토큰 수명 주기'

클라우드 기반 MCP 서비스(PlayMCP 등)를 로컬 AI 에이전트나 데브옵스 파이프라인에
통합할 때 가장 중요한 것은 **인증 토큰의 라이프사이클 관리**다.

1회성 토큰 교환에만 의존하면 12시간 뒤에 침묵 속에 시스템이 중단되고 만다.
카카오의 토큰 로테이션 특성을 파악하고, 불완전한 데몬 대신 **독립 브릿지 +
주기적 백그라운드 회전 크론** 조합을 구축함으로써 비로소 실전에서 마음 놓고
신뢰할 수 있는 한국형 로컬 MCP 비서 환경을 완성할 수 있었다.
