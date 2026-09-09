---
title: "홈랩 운영 일지: PBS 백업 실전 복구, 자격증명 마스킹, 그리고 Ollama 아침 브리핑"
date: "2026-09-09"
tags: ["homelab", "proxmox", "ansible", "ollama", "automation"]
summary: "Proxmox 백업 무결성 검증부터 Ansible 자격증명 로그 차단, 로컬 LLM 기반 Discord 일일 아침 브리핑까지"
---

홈랩 플랫폼을 운영하면서 "돌아가기만 하는 인프라"와 "믿고 맡길 수 있는 운영
시스템" 사이에는 꽤 큰 간극이 있다는 걸 매번 느낀다.

오늘 하루 동안 집중적으로 작업했던 네 가지 핵심 운영 과제를 정리했다:

1. **PBS(Proxmox Backup Server) 파일 단위 실전 복구 시험 & 무결성 검증**
2. **동행복권 자동화 템플릿 정리 & 주간 정기 크론 활성화**
3. **Ansible 민감 자격증명 로그 전수 점검 (Semaphore 로그 보안 강화)**
4. **Ollama(gemma4) 기반 일일 아침 브리핑 파이프라인 구축 & Discord 자동 전송**

---

## 1. "백업이 있다"와 "복구할 수 있다"의 차이

대시보드에서 Proxmox 백업 현황을 보는데 최근 작업 15건이 정상으로 잡히기
시작했다. (`/cluster/tasks` API 호출 시 불필요한 `limit` 쿼리 파라미터를
제거하자 클러스터 전체 4개 노드의 VZDump 백업 내역이 온전히 집계되었다.)

하지만 백업 파일이 초록색 체크로 뜬다고 해서 안심할 수는 없다. **진짜 복구가
되는지** 직접 뜯어봐야 한다.

### 핵심 3대 데이터 대상 복원 테스트

매일 새벽 PBS(`pbs-lxc`)에 스냅샷으로 보관되는 컨테이너들 중 가장 중요한 데이터
3가지를 골라 복구 검증을 진행했다:

- **Browser Bot 가격 모니터링 DB**: `homelab.db` (SQLite)
- **동행복권 봇 구매 저널 & DB**: `lotto.db`, `purchase-journal.json`
- **Semaphore 자동화 컨트롤러 DB**: `database.sqlite`

Proxmox의 File-level Restore
API(`POST /nodes/{node}/storage/{storage}/file-restore/download`)를 활용하여
임시 디렉토리에 복원한 뒤 SQLite 무결성을 검사했다.

```bash
# 복구된 SQLite 무결성 검사 예시
sqlite3 /tmp/restore-test/homelab.db "PRAGMA integrity_check;"
# 결과: ok
```

모니터링 품목 테이블과 구매 이력 저널 모두 단 1비트의 손상 없이 온전히 복원되는
것을 확인하고, 재해 복구 런북(`sqlite-and-service-data-recovery.md`)으로 정리해
두었다. 이제 새벽 백업 알림이 울려도 두 발 뻗고 잘 수 있다.

---

## 2. 주 1회 로또 봇: 모달 설문 제거와 안전한 정기 스케줄

기존에는 Semaphore UI에서 템플릿을 실행할 때마다 모달 설문(Survey) 팝업이 떠서
매번 손으로 확인을 눌러야 했다. 원래 의도는 **"월요일 아침에 단 한 번 알아서
조회하고 한 번만 구매하는 것"**이었다.

이를 위해 템플릿 역할을 세 가지로 깔끔하게 쪼갰다:

- **템플릿 23 (구매 & 잔액)**: 월요일 06:37 KST 자동 크론 (`37 6 * * 1`)
  - 사전 잔액 5,000원 미만 시 자동 중단
  - 5게임 자동 구매 후 잔액 Discord 알림
- **템플릿 24 (당첨 결과 확인)**: 토요일 22:30 KST 자동 크론 (`30 22 * * 6`)
  - 동행복권 API 추첨 결과 대조 후 당첨 여부 알림
- **템플릿 25 (단순 잔액 조회)**: 스케줄 없는 1클릭 수동 전용 (구매 없이 1초
  만에 확인)

컨테이너 이미지 역시 태그(`latest`) 대신 불변의 `sha256` digest로 고정하여
의도치 않은 이미지 변경 위험을 원천 차단했다.

---

## 3. Semaphore 실행 로그의 자격증명 마스킹

자동화 도구(Semaphore, AWX 등)를 쓸 때 가장 흔하게 발생하는 보안 구멍 중 하나가
**"실행 실패 시 에러 덤프에 API 토큰이나 비밀번호가 찍히는 문제"**다.

`provision_lxc.yml`, `audit_network_drift.yml`, `verify_access.yml` 등에서
Proxmox API 토큰(`PVEAPIToken=...`)과 UniFi Controller 세션 쿠키를 사용하는 모든
태스크를 점검했다.

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

- 모든 민감 태스크에 `no_log: true` 적용
- 통신 실패 시에도 토큰이 섞인 raw dump 대신 정제된 HTTP 상태 코드와 원인 안내만
  출력
- 이로써 플랫폼 로드맵의 7가지 필수 작업 큐를 **100% 올클리어**했다.

---

## 4. Ollama + Home Assistant + Proxmox = 일일 아침 브리핑

홈랩에 AMD Radeon 780M 내장 그래픽(ROCm 7.2)을 패스스루한 Ollama 전용
LXC(`gemma4:e2b-it-qat`)가 돌아가고 있다. 평소엔 대시보드 온디맨드 진단용으로만
쓰였는데, 이걸 아침마다 나를 위한 AI 집사로 써보기로 했다.

### 아키텍처 흐름

```
[Home Assistant] ─── 날씨, 실내 온습도, 전력(W) ───┐
[Proxmox Cluster] ── 4개 노드 상태, PBS 백업(15건) ─┼─▶ [Deno Fresh Dashboard]
[Service Health] ─── 21개 서비스 가동 상태 ────────┘          │
                                                              ▼
                                                     [Ollama (gemma4)]
                                                    (프롬프트 팩트시트 주입)
                                                              │
                                                              ▼
                                                   [Discord Webhook 전송]
                                                 (매일 아침 08:30 KST 크론)
```

### 실제 수집되는 팩트 데이터

대시보드 백엔드(`morning_briefing.ts`)에서 다음 정보를 단일 팩트시트로 집계한다:

- **동네 날씨 & 공기질**: 현재 기온 22.1°C, 체감 22.4°C, 습도 57%, 초미세먼지 5,
  미세먼지(PM10: 18 / PM2.5: 5 - 좋음)
- **스마트홈 환경**: 실시간 총 전력 566W, 각 방 실내 온습도
- **홈랩 인프라**: Proxmox 4개 노드 가동 상태, 새벽 PBS 백업 15건 100% 성공(실패
  0건), 서비스 21개 정상 가동

### Ollama에게 던지는 프롬프트

> "당신은 홈랩과 스마트홈을 총괄하는 친절하고 유능한 AI 집사입니다. 측정된
> 사실에 기반하여 외출 옷차림/미세먼지 팁과 홈랩 인프라 요약, 활기찬 응원
> 메시지를 2~3개 문단으로 작성해주세요."

### 실제 Ollama(gemma4)가 작성한 브리핑 메시지

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

이 텍스트는 아침 황금빛 테마(`0xF1C40F`)의 깔끔한 Discord Embed 카드로
포맷팅되어 전송된다.

만약 Ollama 컨테이너가 점검 중이거나 모델 응답이 지연되더라도 메시지가 유실되지
않도록 **견고한 룰 기반 폴백 생성 로직**을 기본 탑재했다.

---

## 5. UI와 모니터링의 역할 분담: Pulse 1클릭 연동

새로 구축한 Deno Fresh 대시보드에 프로그래머블한 시계열 차트를 잔뜩 넣으려다가
생각을 바꿨다. 홈랩에 이미 훌륭한 Proxmox 관제 도구인 **Pulse**가 돌고 있었기
때문이다.

- **Deno Dashboard**: 클러스터 전체 4개 노드의 핵심 지표(CPU/RAM 요약), PBS 백업
  성공 여부, AI 진단 및 런처 중심의 **가벼운 관제 센터** 유지
- **헤더에 `📊 Pulse 상세 ↗` 런처 추가**: 컨테이너별 정밀한 CPU/RAM 드릴다운과
  실시간 시계열 그래프가 필요할 때는 클릭 한 번으로 Pulse 콘솔로 즉시 이동

모든 기능을 한 앱에 우겨넣는 것보다, 이미 잘하는 전문 도구에 역할을 위임하고
연결 고리를 매끄럽게 만드는 편이 유지보수에 훨씬 유리하다.

또한 스마트 플러그 전원 제어의 경우, 서버와 네트워크 스위치가 꽂혀 있는 만큼
**실수로 전원을 끄는 대참사를 막기 위해 의도적으로 On/Off 토글을 배제하고 읽기
전용 전력(W) 모니터링만 유지**하기로 결정했다.

---

## 마치며

하루 동안 여러 영역을 손봤지만 일관된 하나의 원칙이 있었다: **"시스템은 신뢰할수
있는 백업과 안전장치 위에서만 자율성을 가질 수 있다."**

백업 검증과 자격증명 격리가 끝났기에, 주간 로또 구매도, 매일 아침 AI 브리핑도
안심하고 크론에 맡길 수 있게 되었다. 내일 아침 08:30 디스코드에 도착할 AI 집사의
첫 번째 정기 브리핑이 사뭇 기다려진다.
