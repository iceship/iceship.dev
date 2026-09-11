---
title: "홈랩 운영 일지: PBS 백업 복구 테스트, 로또 봇 크론, 그리고 Ollama 아침 브리핑"
date: "2026-09-09"
tags: ["homelab", "proxmox", "ansible", "ollama", "automation"]
summary: "백업 무결성 검증부터 Ansible 자격증명 마스킹, 로컬 LLM 기반 Discord 일일 아침 브리핑 구축기"
---

홈랩을 굴리다 보면 "일단 돌아가니까 됐다" 싶다가도, 문득 "이거 진짜 백업은 잘
되고 있나? 복구는 되나?" 하는 불안감이 들 때가 있다.

오늘 하루 동안 손봤던 작업들을 잊어버리기 전에 정리해둔다:

1. **PBS(Proxmox Backup Server) 파일 단위 실전 복구 시험 & 무결성 검사**
2. **동행복권 자동화 템플릿 정리 & 주간 정기 크론 등록**
3. **Ansible/Semaphore 실행 로그에 비밀번호/토큰 찍히는 문제 해결**
4. **Ollama(gemma4) + Home Assistant로 매일 아침 디스코드 브리핑 봇 만들기**
5. **대시보드 모니터링은 잘하는 놈(Pulse)한테 맡기기**

---

## 1. "백업이 있다"와 "복구할 수 있다"의 차이

대시보드에서 Proxmox 백업 현황을 보는데 최근 작업들이 정상으로 초록불이 들어오기
시작했다. (`/cluster/tasks` API 호출할 때 불필요한 `limit` 쿼리 파라미터를
빼버렸더니 4개 노드의 VZDump 백업 내역이 온전히 집계됨)

하지만 초록불 뜬다고 안심할 수는 없다. **진짜 복구가 되는지** 직접 뜯어봐야
마음이 편하다.

### 핵심 3대 데이터 복원 테스트

매일 새벽 PBS(`pbs-lxc`)에 스냅샷으로 저장되는 컨테이너들 중 제일 중요한 DB
3개를 골라서 복구해봤다:

- **가격 모니터링 DB**: `homelab.db` (SQLite)
- **동행복권 봇 구매 저널 & DB**: `lotto.db`, `purchase-journal.json`
- **Semaphore 자동화 컨트롤러 DB**: `database.sqlite`

Proxmox의 File-level Restore
API(`POST /nodes/{node}/storage/{storage}/file-restore/download`)로 파일만 쏙
뽑아서 임시 폴더에 풀고, SQLite 무결성 검사를 돌렸다.

```bash
# 복구된 SQLite 무결성 검사
sqlite3 /tmp/restore-test/homelab.db "PRAGMA integrity_check;"
# 결과: ok
```

테이블이랑 구매 이력 저널 모두 깨진 부분 없이 깔끔하게 복원되는 걸 확인했다.
복구 매뉴얼도 정리해뒀으니 이제 새벽 백업 알림이 와도 두 발 뻗고 잘 수 있겠다.

---

## 2. 주 1회 로또 봇: 매번 누르기 귀찮아서 자동화

예전에 동행복권 봇을 만들어뒀는데, Semaphore UI에서 실행할 때마다 모달
설문(Survey) 팝업이 떠서 매번 손으로 확인 버튼을 눌러줘야 했다.

원래 생각했던 건 **"월요일 아침에 알아서 딱 1번만 사고 끝내는 것"**이었는데 매번
손이 가니 귀찮았다.

그래서 템플릿을 세 개로 깔끔하게 쪼갰다:

- **템플릿 23 (구매 & 잔액)**: 월요일 06:37 KST 자동 크론 (`37 6 * * 1`)
  - 잔액 5,000원 미만이면 자동 중단
  - 5게임 자동 구매 후 남은 잔액을 Discord로 알림
- **템플릿 24 (당첨 결과 확인)**: 토요일 22:30 KST 자동 크론 (`30 22 * * 6`)
  - 추첨 결과 대조 후 당첨 여부 알림
- **템플릿 25 (단순 잔액 조회)**: 크론 없는 1클릭 수동 전용 (구매 없이 잔액만
  확인할 때)

컨테이너 이미지도 `latest` 태그 대신 고정된 `sha256` digest로 박아서 의도치 않게
이미지가 바뀌는 일도 막았다.

---

## 3. Semaphore 실행 로그에 비밀번호/토큰 찍히는 문제 해결

자동화 도구를 쓸 때 제일 찝찝한 것 중 하나가 **실행 실패했을 때 에러 덤프에 API
토큰이나 비밀번호가 그대로 찍히는 문제**다.

Proxmox API 토큰(`PVEAPIToken=...`)이랑 UniFi Controller 세션을 쓰는
플레이북들을 하나씩 열어서 점검했다.

```yaml
- name: Verify Proxmox API token with a read-only request
  ansible.builtin.uri:
    url: "https://{{ pve_api_host }}:{{ pve_api_port }}/api2/json/version"
    method: GET
    headers:
      Authorization: "PVEAPIToken={{ pve_api_user }}!{{ pve_api_token_id }}={{ pve_api_token_secret }}"
    validate_certs: false
    status_code: [200]
  register: pve_access_check
  changed_when: false
  failed_when: false
  no_log: true # 👈 자격증명 및 헤더 로그 노출 차단

- name: Report Proxmox API verification failure
  when: pve_access_check.status | default(0) != 200
  ansible.builtin.fail:
    msg: >-
      Proxmox API verification failed (HTTP status={{ pve_access_check.status | default('unknown') }}).
      Please check PVE host and API token permissions.
```

- 민감한 태스크에 `no_log: true` 추가
- 통신이 실패해도 토큰이 들어간 raw dump 대신 HTTP 상태 코드랑 원인만 나오게
  정리

이제 실행 로그 보면서 토큰 새어 나갈까 봐 걱정할 일은 없어졌다.

---

## 4. Ollama + Home Assistant로 매일 아침 디스코드 브리핑 받기

홈랩에 AMD Radeon 780M 내장 그래픽(ROCm 7.2)을 패스스루해서 돌리고 있는
Ollama(gemma4)가 있다. 평소엔 가끔 진단할 때 말곤 놀고 있어서, 아침마다 나를
위한 AI 비서로 써먹어보기로 했다.

### 전체 흐름

```
[Home Assistant] ─── 날씨, 실내 온습도, 전력(W) ───┐
[Proxmox Cluster] ── 4개 노드 상태, PBS 백업(15건) ─┼─▶ [Deno Fresh Dashboard]
[Service Health] ─── 21개 서비스 가동 상태 ────────┘          │
                                                          ▼
                                                  [Ollama (gemma4)]
                                                   (수집한 데이터 주입)
                                                         │
                                                         ▼
                                               [Discord Webhook 전송]
                                              (매일 아침 08:30 KST 크론)
```

### 실제로 긁어오는 데이터

대시보드 백엔드(`morning_briefing.ts`)에서 아래 정보들을 한 번에 모은다:

- **동네 날씨 & 공기질**: 현재 기온 22.1°C, 체감 22.4°C, 습도 57%, 초미세먼지 5
  (좋음)
- **스마트홈 환경**: 실시간 총 전력 566W, 방별 실내 온습도
- **홈랩 인프라**: Proxmox 4개 노드 상태, 새벽 PBS 백업 15건 100% 성공, 서비스
  21개 정상 가동

### Ollama 프롬프트

> "당신은 홈랩과 스마트홈을 총괄하는 친절하고 유능한 AI 집사입니다. 측정된
> 사실에 기반하여 외출 옷차림/미세먼지 팁과 홈랩 인프라 요약, 활기찬 응원
> 메시지를 2~3개 문단으로 작성해주세요."

### 실제로 Ollama가 보내준 메시지

> 안녕하세요! 사용자님의 스마트홈과 홈랩을 책임지는 AI 비서입니다. 오늘 하루도
> 완벽하게 준비되셨는지, 상쾌하고 유익한 아침 브리핑을 시작합니다!
>
> **[오늘의 환경 및 시스템 현황]** 오늘 동네의 날씨는 흐리지만 기온은 22.1도로
> 쾌적합니다. 실내 체감 온도도 22.4도로 편안하며, 미세먼지 수치(초미세 5,
> 좋음)가 매우 깨끗하여 야외 활동에 제격입니다. 스마트홈 시스템은 현재 총 전력
> 566W를 사용하며 안정적입니다. 특히 홈랩 인프라 점검 결과, Proxmox 4개 노드
> 모두 정상 가동 중이며 새벽 PBS 백업 15건 모두 100% 성공하여 데이터 안전성까지
> 확보되었습니다.
>
> **[오늘의 꿀팁 및 활기찬 응원]** 외출 시에는 가벼운 외투를 챙기시는 것을
> 추천드립니다. 시스템은 완벽하게 가동 중이니 걱정 내려놓으시고, 오늘 계획하신
> 일들을 자신감 있게 추진해 보세요! 행복한 하루 되세요! 😊

이 내용을 노란빛 카드 테마로 만들어서 디스코드 웹훅으로 쏴준다. 혹시 Ollama가
꺼져 있거나 응답이 늦어지더라도 메시지가 아예 안 오면 안 되니까, 규칙 기반 기본
텍스트 폴백도 넣어뒀다.

---

## 5. 모니터링은 잘하는 놈(Pulse)한테 맡기자

새로 만든 대시보드에 그래프랑 차트를 이것저것 잔뜩 그려 넣으려다가 그만뒀다.
홈랩에 이미 Proxmox 전용 관제 도구인 **Pulse**가 워낙 잘 돌고 있기 때문이다.

- **Deno Dashboard**: 4개 노드 요약(CPU/RAM), PBS 백업 성공 여부, AI 진단 같은
  **가벼운 관제 센터** 역할만 유지
- **헤더에 `📊 Pulse 상세 ↗` 링크 추가**: 세부 컨테이너 지표나 실시간 그래프가
  보고 싶을 땐 Pulse로 바로 넘어가기

모든 기능을 한곳에 다 쑤셔 넣는 것보다 이미 잘 돌아가는 도구를 연결하는 게
관리하기 훨씬 편하다.

그리고 스마트 플러그 전원 제어의 경우, 서버랑 스위치가 물려 있는데 실수로 끄는
대참사가 나면 안 되니 **On/Off 버튼은 아예 빼고 전력량(W)만 보게** 만들었다.

---

## 마무리

하루 동안 이것저것 손봤지만 핵심은 하나다. **"백업이랑 안전장치가 제대로 되어
있어야 마음 놓고 자동화도 돌릴 수 있다."**

복구 테스트도 해봤고 토큰 마스킹도 끝났으니, 이제 로또 봇이랑 아침 브리핑도
안심하고 크론에 맡길 수 있게 되었다.

내일 아침 8시 30분에 디스코드로 날아올 첫 브리핑이 기다려진다. 끝!
