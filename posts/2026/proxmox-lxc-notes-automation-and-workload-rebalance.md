---
title: "Proxmox 클러스터 30개 LXC Notes 일괄 자동화와 고부하 워크로드 재배치"
date: "2026-09-14"
tags: ["proxmox", "homelab", "lxc", "zfs", "automation", "python"]
summary: "Proxmox VE 8 pmxcfs 인코딩 버그를 해결하며 30개 LXC Notes를 마크다운으로 일괄 자동화하고, ZFS 스트림 마이그레이션으로 노드 간 메모리를 재밸런싱한 기록"
---

> **보안 메모**: 본문에 등장하는 노드명, 사설 IP 대역, 내부 도메인, 패스워드,
> 하드웨어 식별자는 공개용으로 안전하게 임의 변경(가상화)했다.

---

## 1. 문제의 발단: 파편화된 Notes와 자원 쏠림

홈랩에서 Proxmox VE 4노드 클러스터를 장기간 운영하다 보면 두 가지 고질적인
문제가 생긴다.

### ① 지저분하게 방치된 컨테이너 Notes (Description)

Proxmox GUI의 각 컨테이너 화면 우측에는 **Notes** 패널이 있다. 여기에 마크다운
렌더링을 지원하기 때문에 각 서비스의 용도, 관리자 웹 UI 링크, DB 계정, 포트 정보
등을 적어두면 매우 편리하다.

하지만 현실은:

- 어떤 컨테이너는 community-scripts 기본 설치 안내 배너(Buy us a coffee...)만
  덩그러니 남아있음
- 어떤 컨테이너는 개발할 때 급하게 적어둔 평문 접속 URL 한 줄만 있거나 아예
  비어있음
- 과거 테스트용으로 쓰던 데이터베이스 계정과 현재 프로덕션 계정이 뒤섞여 구분
  불가능

30개가 넘는 LXC 컨테이너를 일일이 GUI에서 클릭해 수정하는 것은 매우 비효율적이고
실수할 확률도 높다.

### ② 메인 노드로의 워크로드 집중과 자원 불균형

클러스터의 물리 머신 스펙은 다음과 같다.

```text
hv-primary (AMD Ryzen 8C/16T / 78 GB RAM): 메인 컴퓨트 노드
hv-worker  (AMD Ryzen 6C/12T / 60 GB RAM): 보조 및 IoT 노드
hv-backup  (Intel N100 4C/4T / 16 GB RAM): PBS 전용 노드
hv-ops     (Intel J6412 4C/4T / 48 GB RAM): 자동화/대기 노드
```

상태를 점검해 보니, `hv-primary`에 온갖 핵심 워크로드가 집중되어 있었다.

- 로컬 LLM 추론 서버 (ROCm iGPU 가속)
- PostgreSQL 16 메인 DB (Git 서버 메인 DB)
- Gitea 및 CI/CD 빌드 러너
- Docker 전용 호스트 (대시보드, 브라우저 자동화 봇)
- 웹 스크래핑/크롤러 엔진 (**Firecrawl**)

그 결과 `hv-primary`의 메모리 사용량은 **51 GB (65%)**를 넘어서고 있었고, 웹
크롤러가 헤드리스 크롬(Chromium) 인스턴스를 여러 개 띄울 때마다 순간적인
CPU/메모리 스파이크가 발생해 LLM 추론이나 DB 응답에 간섭을 줄 위험이 있었다.

반면 `hv-worker`는 60 GB RAM 중 고작 **8.6 GB (13%)**만 사용하며 **50 GB가 넘는
메모리가 완전히 유휴 상태**로 놀고 있었다.

---

## 2. Proxmox pmxcfs의 비밀과 Notes 일괄 자동화

30개 컨테이너의 Notes를 한 번에 정리하기 위해 PVE 내부 구조를 분석했다.

### Proxmox의 설정 파일 저장 방식

Proxmox VE의 모든 가상머신 및 컨테이너 설정 파일은 클러스터 동기화 파일시스템인
`pmxcfs`(`/etc/pve`)에 저장된다.

- 경로: `/etc/pve/nodes/<노드명>/lxc/<vmid>.conf`

이 파일의 내용을 확인해 보면, 마크다운으로 작성된 Description은 파일 상단에
주석(`#`) 형태로 한 줄씩 저장된다.

```text
#### %F0%9F%90%98 PostgreSQL Cluster (CT 504)
#* **Web UI**%3A http%3A//10.80.40.4/adminer
#* **Host**%3A `10.80.40.4%3A5432`
...
arch: amd64
cores: 4
...
```

### 주의: 단순 CLI/API 주입 시 한글 깨짐 (`%EF%BF%BD`) 버그

처음에는 `pvesh` 명령어나 일반 서브프로세스를 통해 `-description` 인자로
마크다운을 넘기려 했다.

```bash
# ⚠️ 주의: 셸 환경에 따라 비-ASCII(한글, 이모지) 인코딩이 깨지는 현상 발생
pvesh set /nodes/hv-worker/lxc/2426/config --description "$MARKDOWN_TEXT"
```

결과는 참담했다. 한글과 이모지가 모조리 깨져 유니코드 대체 문자(`\ufffd` 및
`%EF%BF%BD`)로 저장되는 것이었다.

Proxmox의 백엔드 Perl 모듈(`PVE::Tools`, `PVE::ParseUtils`) 코드를 직접 열어보니
원인을 알 수 있었다.

```perl
# /usr/share/perl5/PVE/ParseUtils.pm
sub encode_text($text) {
    # all control and hi-bit characters, ':' and '%'
    my $unsafe = "^\x20-\x24\x26-\x39\x3b-\x7e";
    return uri_escape(Encode::encode("utf8", $text), $unsafe);
}
```

Proxmox는 설정 파일에 헤더 주석을 기록할 때, `0x20~0x7E` 범위의 인쇄 가능한
ASCII 문자 중 `%`와 `:`를 제외한 모든 문자만 안전(safe)으로 간주하고, 나머지
UTF-8 바이트나 제어 문자는 엄격하게 퍼센트 인코딩(URI escape)한다.

### Python 기반의 안전한 일괄 갱신 스크립트 작성

원리를 파악했으니, Python의 `urllib.parse.quote`를 PVE의 인코딩 규칙과 정확히
일치하도록 구성했다.

```python
import os
import urllib.parse

# PVE의 안전 문자 집합 재현: 0x20~0x7E 중 '%'와 ':' 제외
safe_chars = set()
for b in range(0x20, 0x7f):
    if b not in (0x25, 0x3a):  # exclude % and :
        safe_chars.add(chr(b))
safe_str = "".join(safe_chars)

def pve_encode_text(line: str) -> str:
    return urllib.parse.quote(line.encode("utf-8"), safe=safe_str)

def update_container_notes(vmid: int, node: str, markdown_text: str):
    conf_path = f"/etc/pve/nodes/{node}/lxc/{vmid}.conf"
    if not os.path.exists(conf_path):
        return

    with open(conf_path, "r", encoding="utf-8") as f:
        lines = f.read().splitlines()

    # 기존 설명 헤더 주석 분리
    body_lines = []
    in_header = True
    for line in lines:
        if in_header and line.startswith("#"):
            continue
        in_header = False
        body_lines.append(line)

    # 신규 마크다운을 PVE 규격으로 인코딩하여 주석화
    header_lines = ["#" + pve_encode_text(l) for l in markdown_text.splitlines()]
    new_content = "\n".join(header_lines + body_lines) + "\n"

    with open(conf_path, "w", encoding="utf-8") as f:
        f.write(new_content)
```

이 스크립트를 클러스터 마스터 노드에서 실행하자, 30개 컨테이너 전체의 Notes가
**단 1초 만에** 최신 템플릿으로 말끔하게 교체되었다.

클러스터 API 검증 결과:

```text
Total LXC Containers: 30
===========================================================================
[  105] hv-worker  | running | mqtt        | Broken: False | ### 📡 Mosquitto MQTT Broker
[  106] hv-worker  | running | zigbee2mqtt | Broken: False | ### 🐝 Zigbee2MQTT Coordinator
[  504] hv-primary | running | postgresql  | Broken: False | ### 🐘 PostgreSQL Cluster
[  522] hv-worker  | running | redis       | Broken: False | ### ⚡ Redis Cache & Key-Value
[54152] hv-primary | running | firecrawl   | Broken: False | ### 🔥 Firecrawl Web Scraper
...
```

인코딩 깨짐(`Broken: False`) 0건으로 완벽하게 적용되었다.

---

## 3. 고부하 워크로드(Firecrawl, Redis, RabbitMQ) 마이그레이션

Notes 정리가 끝난 뒤, 자원 불균형 문제를 해결하기 위해 `hv-primary`에서
불필요하게 리소스를 점유하던 서비스들을 여유 있는 `hv-worker` 노드로 이전했다.

### 이전 대상 워크로드

1. **Firecrawl (LXC 54152)**: 웹페이지 LLM 마크다운 변환 엔진 (헤드리스 크롬
   구동, 메모리 4 GB / 4코어)
2. **RabbitMQ (LXC 544)**: 메시지 브로커 (비동기 큐, 메모리 1 GB 증설)
3. **Redis (LXC 522)**: 인메모리 캐시 및 분산 락

### ZFS 스트림 마이그레이션 (`pct migrate`)

Proxmox의 `local-zfs` 스토리지는 노드 간 스냅샷 스트림 전송을 네이티브로
지원한다.

```bash
# 1. 안전하게 컨테이너 정지
pct stop 54152

# 2. 보조 노드로 ZFS 스토리지 스트림 마이그레이션
pct migrate 54152 hv-worker --target-storage local-zfs

# 3. 타깃 노드에서 컨테이너 기동
pct start 54152
```

Firecrawl의 경우 약 5.8 GB 크기의 ZFS 서브볼륨이었으나, 노드 간 2.5G/기가비트
네트워크 대역폭 덕분에 **57초 만에 무손실 마이그레이션이 완료**되었다.

### 하이브리드 고정 IP 패턴 덕분에 '무수정' 연동

여기서 가장 큰 장점이 드러났다. 우리 홈랩 네트워크는 **UniFi DHCP 고정 예약 +
Proxmox 정적 IP 주입(Hybrid Static IP)** 원칙을 따른다.

- 컨테이너의 가상 MAC 주소(`02:42:0a:50:28:9b`)가 UniFi 게이트웨이에 고정
  IP(`10.80.40.152`)로 매핑되어 있음
- 컨테이너가 물리적으로 어느 PVE 노드로 이사를 가든 동일한 VLAN
  브릿지(`vmbr0.40`)에 붙기만 하면 기존 IP를 100% 그대로 유지함

덕분에 Firecrawl을 호출하던 내부 대시보드, 가격 모니터링 봇, AI 에이전트
게이트웨이 등의 설정을 단 한 줄도 수정할 필요가 없었다.

---

## 4. 최종 결과 및 리소스 변화

마이그레이션 직후 노드별 메모리 사용량 변화는 다음과 같다.

| 노드                    | 이전 전 메모리 점유  |   이전 후 메모리 점유    | 비고                                                     |
| :---------------------- | :------------------: | :----------------------: | :------------------------------------------------------- |
| **`hv-primary`** (메인) | 51.1 GB (사용률 65%) | **43.6 GB (사용률 55%)** | **약 7.5 GB 메모리 즉시 회수** (Ollama, PG DB 여유 확보) |
| **`hv-worker`** (보조)  | 8.6 GB (사용률 13%)  | **10.8 GB (사용률 17%)** | **50.0 GB의 넉넉한 여유 RAM** 유지                       |

Firecrawl API 헬스체크:

```bash
curl -i http://10.80.40.152:3002/
# HTTP/1.1 200 OK
# X-Response-Time: 1.219ms
# {"message":"Firecrawl API","documentation_url":"https://docs.firecrawl.dev"}
```

응답 속도 1.2ms로 매우 쾌적하게 동작함을 확인했다.

---

## 5. 배운 점 & 운영 팁

1. **GUI에서 하지 말고 파일시스템 구조를 이해하자**: Proxmox 웹 콘솔에서 수십 번
   클릭할 작업을 `/etc/pve`의 구조와 문자열 인코딩 규격을 파악함으로써 1초 만에
   스크립트로 끝낼 수 있었다.
2. **고부하 헤드리스 브라우저/크롤러는 메인 DB 노드와 반드시 격리하자**:
   Puppeteer/Playwright 계열 워크로드는 메모리 누수나 CPU 스파이크가 발생하기
   쉽다. 로컬 LLM 추론 노드나 메인 DB 호스트와 물리 노드 레벨에서 분리해 두는
   것이 클러스터 전체의 생존성을 높인다.
3. **네트워크 설계가 잘 되어 있으면 마이그레이션은 두렵지 않다**: VLAN과 DHCP
   예약이 표준화되어 있다면, 컨테이너를 다른 노드로 던지는 작업은 1분도 채
   걸리지 않는 가벼운 유지보수 작업이 된다.
