---
title: "UniFi IGMP Proxy 환경에서 B tv가 약 8분마다 멈춘 문제 추적과 우회 방법"
date: "2026-09-11"
tags: ["unifi", "igmp", "multicast", "iptv", "apple-tv", "network"]
summary: "Apple TV에서 B tv 실시간 방송이 약 8분 간격으로 7~10초씩 멈추는 문제를 패킷 캡처와 multicast routing state로 추적하고, IGMPv2 General Query를 주기적으로 보내는 방식으로 안정화한 과정을 정리했습니다."
---

> 이 글의 IP 주소, 인터페이스 이름 일부, multicast group, 장비 이름 등은 보안을 위해 임의의 값으로 변경했습니다.  
> 실제 환경에 적용할 때는 자신의 네트워크 주소와 인터페이스 이름을 확인해서 바꿔야 합니다.

## 1. 증상

UniFi Gateway에서 IGMP Proxy를 사용해 IPTV multicast를 별도 VLAN으로 전달하고 있었는데, Apple TV의 B tv 실시간 방송이 일정한 간격으로 멈추는 문제가 있었습니다.

증상은 다음과 같았습니다.

- 영상은 정상적으로 약 13~14 Mbps 수준으로 수신됨
- 약 8분 20초 간격으로 영상이 7~10초 정도 멈춤
- 정지 후에는 자동으로 다시 재생됨
- Apple TV 자체 네트워크는 끊기지 않음
- 같은 VLAN의 다른 multicast traffic은 일부 계속 정상
- IGMP Snooping을 OFF로 바꿔도 동일 증상 발생
- 다시 ON으로 바꿔도 동일 증상 발생

처음에는 Apple TV 앱 문제, 스위치의 IGMP Snooping 문제, 방화벽 문제 등을 의심했지만, 실제 multicast packet 흐름을 확인하면서 원인을 좁혀갔습니다.

## 2. 테스트 환경

실제 값은 아래처럼 익명화했습니다.

```text
Gateway              : UniFi Dream Router 계열
IPTV WAN interface   : eth3
IPTV viewing VLAN    : VLAN 50
VLAN gateway         : 10.20.50.1
Apple TV             : 10.20.50.222
Monitoring LXC       : 10.20.50.108

Main IPTV group      : 239.200.50.6:49220
Main IPTV source     : 192.0.2.122:4999

Aux group #1         : 239.200.60.13:49200
Aux group #2         : 239.200.60.43:49200
```

UniFi 설정은 최종적으로 다음 상태를 유지했습니다.

```text
IGMP Proxy        : ON
IGMP Snooping     : ON
Fast Leave        : OFF
Querier Selection : 기존 환경 유지
```

## 3. 먼저 실제 multicast packet loss인지 확인

모니터링용 Debian LXC에서 main IPTV multicast stream을 join한 뒤 RTP sequence와 packet rate를 확인했습니다.

정상 상태에서는 대략 다음과 같이 들어왔습니다.

```text
video=1292pkt 13.73Mbps
video_lost=0
```

그런데 화면이 멈춘 순간:

```text
12:21:17 | video=1050pkt 11.16Mbps | video_lost=63340
12:21:18 | video=   0pkt  0.00Mbps | video_lost=63340
12:21:19 | video=   0pkt  0.00Mbps | video_lost=63340
...
12:21:27 | video=   0pkt  0.00Mbps | video_lost=63340
12:21:28 | video=1055pkt 11.21Mbps | video_lost=76736
```

RTP sequence loss 증가량은 다음과 같았습니다.

```text
76736 - 63340 = 13396 packets
```

평소 약 1292 packets/s이므로:

```text
13396 / 1292 ≈ 10.37 seconds
```

실제 화면이 멈춘 시간과 거의 정확히 일치했습니다.

즉 이 문제는 단순한 Apple TV 디코더 오류가 아니라 **실제 multicast packet delivery가 중단되는 문제**였습니다.

## 4. Gateway upstream과 VLAN downstream을 동시에 비교

다음으로 Gateway의 WAN 쪽과 VLAN 50 쪽을 동시에 확인했습니다.

```bash
tcpdump -lni eth3 -nn -tt \
  'src host 192.0.2.122 and dst host 239.200.50.6 and udp port 49220'
```

```bash
tcpdump -lni br50 -nn -tt \
  'src host 192.0.2.122 and dst host 239.200.50.6 and udp port 49220'
```

여러 번 반복해서 다음 패턴이 관찰됐습니다.

```text
ETH3-UPSTREAM GAP  3.069 sec
BR50-DOWNSTREAM GAP 10.241 sec
```

즉 upstream multicast는 약 3초 후 다시 들어오기 시작했지만, VLAN 쪽으로는 약 10초가 지나야 다시 전달되는 경우가 있었습니다.

이 시점부터 단순 ISP 문제 하나로 설명하기는 어려워졌고, Gateway 내부의 IGMP Proxy 또는 multicast routing state를 확인하기 시작했습니다.

## 5. WAN IGMP 로그에서 Leave를 발견

Gateway의 WAN interface에서 IGMP를 캡처했습니다.

```bash
tcpdump -lni eth3 -nn -tttt -vv igmp
```

화면이 멈추기 직전 다음 순서가 반복됐습니다.

```text
12:37:56.322  Gateway -> 224.0.0.2
               igmp leave 239.200.50.6

12:37:56.330  ISP Gateway -> 239.200.50.6
               igmp query v2 [gaddr 239.200.50.6]

12:37:59.382  Gateway -> 239.200.50.6
               igmp v2 report 239.200.50.6
```

여기서 중요한 점은 **Apple TV의 Leave보다 Gateway의 WAN Leave가 먼저 발생했다는 것**입니다.

LAN 쪽에서는 이후에 Apple TV가 stream 복구를 시도하면서 report/leave/report를 반복하는 패턴이 보였습니다.

따라서 흐름은 다음과 같이 보였습니다.

```text
Gateway IGMP Proxy가 upstream membership을 제거
        ↓
Gateway가 WAN으로 Leave 전송
        ↓
IPTV multicast 중단
        ↓
Apple TV가 stream loss 감지
        ↓
Apple TV가 Report / Leave / Report 재시도
        ↓
Gateway가 WAN으로 Report 전송
        ↓
stream 복구
```

## 6. 약 500초 주기로 반복

가장 흥미로운 점은 장애 발생 간격이었습니다.

```text
11:48:09
11:56:30
12:04:50
12:13:02
12:21:24
12:29:47
12:37:59
```

대략 500초, 즉 약 8분 20초 간격으로 반복됐습니다.

이 정도로 규칙적인 주기는 물리적인 링크 불량이나 랜덤 packet loss보다는 **timer 기반의 IGMP membership/state 처리 문제**를 강하게 의심하게 했습니다.

## 7. multicast routing state를 1초 단위로 기록

Gateway에서 multicast route와 bridge MDB 상태를 1초마다 기록했습니다.

정상 상태:

```text
MR=(192.0.2.122,239.200.50.6)
Iif: eth3
Oifs: br50
State: resolved

MDB=switch0.50,eth4.50
```

장애 순간:

```text
12:37:56 | MR=resolved
12:37:57 | MR=unresolved | CACHE=pkts=0
12:37:58 | MR=unresolved | CACHE=pkts=0
12:37:59 | MR=unresolved | CACHE=pkts=0
...
12:38:05 | MR=unresolved | CACHE=pkts=0
12:38:06 | MR=resolved   | CACHE=pkts=282
```

특히 bridge MDB에는 listener 정보가 남아 있는데도 L3 multicast route가 `unresolved`로 바뀌었습니다.

즉 문제는 단순히 스위치의 IGMP Snooping table이 사라지는 것이 아니라, **Gateway의 multicast routing / IGMP Proxy state가 순간적으로 풀리는 현상**에 가까웠습니다.

## 8. IGMP Snooping은 원인이 아니었다

처음에는 IGMP Snooping을 의심해서 OFF로 테스트했습니다.

하지만 OFF 상태에서도 동일하게 약 7~10초 정지가 발생했습니다.

다시 ON으로 설정한 후에도 동일 현상이 반복됐습니다.

따라서 최종 설정은 다음과 같이 유지했습니다.

```text
IGMP Snooping : ON
Fast Leave    : OFF
IGMP Proxy    : ON
```

방화벽 규칙도 변경하지 않았습니다.

방화벽이 원인이라면 약 500초마다 Gateway가 WAN으로 IGMP Leave를 생성하고 multicast route가 `unresolved`가 되는 패턴을 설명하기 어렵기 때문입니다.

## 9. 우회 방법: IGMPv2 General Query 추가

테스트로 VLAN 50에 IGMPv2 General Query를 125초마다 한 번씩 추가했습니다.

기존 Gateway의 IGMPv3 General Query는 그대로 유지했고, 추가로 v2 Query만 보냈습니다.

패킷 캡처에서는 다음과 같이 v2와 v3가 함께 보였습니다.

```text
12:49:08  10.20.50.1 -> 224.0.0.1  igmp query v2
12:50:14  10.20.50.1 -> 224.0.0.1  igmp query v3
12:51:13  10.20.50.1 -> 224.0.0.1  igmp query v2
```

우회 적용 전에는 약 8분 20초마다 계속 끊겼지만, v2 General Query를 추가한 뒤 20분 이상 테스트하는 동안 새로운 multicast gap이나 화면 정지가 발생하지 않았습니다.

따라서 이 환경에서는 **IGMPv2 General Query를 주기적으로 보내 downstream membership을 refresh하는 방식이 효과적인 workaround**로 동작했습니다.

> 이 방법은 Gateway firmware 자체를 수정하는 정식 해결책이 아니라, 현재 환경에서 확인한 우회 방법입니다.  
> UniFi Network / Gateway firmware가 업데이트된 뒤에는 workaround 없이도 문제가 해결됐는지 다시 확인하는 것이 좋습니다.

## 10. 필요할 때만 실행하는 MacBook 스크립트

Gateway 내부에 영구 파일을 설치하는 대신, 필요할 때 MacBook에서 SSH로 실행할 수 있게 했습니다.

MacBook에서:

```bash
chmod +x btv-igmpv2.sh
```

시작:

```bash
./btv-igmpv2.sh start
```

상태 확인:

```bash
./btv-igmpv2.sh status
```

최근 로그:

```bash
./btv-igmpv2.sh log
```

중지:

```bash
./btv-igmpv2.sh stop
```

스크립트는 Gateway의 `/tmp`에 임시 Python sender를 생성하고 실행합니다.

재부팅되면 `/tmp` 내용은 사라지므로, 필요할 때 MacBook에서 다시 `start` 하면 됩니다.

## 11. MacBook용 전체 스크립트

아래 예시는 실제 주소를 익명화한 버전입니다.

`ROUTER_HOST`, `IFACE`, `SRC`를 자신의 환경에 맞게 수정해야 합니다.

```bash
#!/usr/bin/env bash
set -euo pipefail

ROUTER_HOST="${ROUTER_HOST:-root@HomeGateway}"
REMOTE_PY="/tmp/igmpv2-query.py"
REMOTE_PID="/tmp/igmpv2-query.pid"
REMOTE_LOG="/tmp/igmpv2-query.log"

usage() {
  cat <<EOF
Usage: $(basename "$0") {start|stop|status|log}

Environment:
  ROUTER_HOST   SSH target
                default: $ROUTER_HOST
EOF
}

start_remote() {
  ssh "$ROUTER_HOST" 'sh -s' <<'REMOTE'
set -eu

PY=/tmp/igmpv2-query.py
PIDFILE=/tmp/igmpv2-query.pid
LOG=/tmp/igmpv2-query.log

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "Already running: PID $(cat "$PIDFILE")"
  tail -n 5 "$LOG" 2>/dev/null || true
  exit 0
fi

cat >"$PY" <<'PY'
#!/usr/bin/env python3

import signal
import socket
import struct
import time
from datetime import datetime

IFACE = "br50"
SRC = "10.20.50.1"
DST = "224.0.0.1"

INTERVAL = 125
MAX_RESP = 100

running = True


def checksum(data):
    if len(data) % 2:
        data += b"\x00"

    words = struct.unpack("!%dH" % (len(data) // 2), data)
    total = sum(words)

    total = (total & 0xFFFF) + (total >> 16)
    total = (total & 0xFFFF) + (total >> 16)

    return (~total) & 0xFFFF


def make_query():
    group = socket.inet_aton("0.0.0.0")

    packet = struct.pack(
        "!BBH4s",
        0x11,
        MAX_RESP,
        0,
        group,
    )

    csum = checksum(packet)

    return struct.pack(
        "!BBH4s",
        0x11,
        MAX_RESP,
        csum,
        group,
    )


def stop_handler(signum, frame):
    global running
    running = False


signal.signal(signal.SIGTERM, stop_handler)
signal.signal(signal.SIGINT, stop_handler)

sock = socket.socket(
    socket.AF_INET,
    socket.SOCK_RAW,
    socket.IPPROTO_IGMP,
)

SO_BINDTODEVICE = getattr(socket, "SO_BINDTODEVICE", 25)

sock.setsockopt(
    socket.SOL_SOCKET,
    SO_BINDTODEVICE,
    (IFACE + "\0").encode(),
)

sock.setsockopt(
    socket.IPPROTO_IP,
    socket.IP_MULTICAST_IF,
    socket.inet_aton(SRC),
)

sock.setsockopt(
    socket.IPPROTO_IP,
    socket.IP_MULTICAST_TTL,
    1,
)

sock.setsockopt(
    socket.IPPROTO_IP,
    socket.IP_TOS,
    0xC0,
)

# IPv4 Router Alert option
sock.setsockopt(
    socket.IPPROTO_IP,
    socket.IP_OPTIONS,
    b"\x94\x04\x00\x00",
)

query = make_query()

while running:
    sock.sendto(query, (DST, 0))

    print(
        f"{datetime.now():%Y-%m-%d %H:%M:%S} "
        f"IGMPv2 General Query sent "
        f"{SRC} -> {DST} via {IFACE}",
        flush=True,
    )

    for _ in range(INTERVAL):
        if not running:
            break

        time.sleep(1)

sock.close()
PY

chmod +x "$PY"
: >"$LOG"

nohup python3 -u "$PY" \
    </dev/null >>"$LOG" 2>&1 &

PID=$!
echo "$PID" >"$PIDFILE"

sleep 1

if kill -0 "$PID" 2>/dev/null; then
  echo "Started: PID $PID"
  tail -n 5 "$LOG"
else
  echo "ERROR: failed to start" >&2
  cat "$LOG" >&2 || true
  rm -f "$PIDFILE"
  exit 1
fi
REMOTE
}


stop_remote() {
  ssh "$ROUTER_HOST" 'sh -s' <<'REMOTE'
set -eu

PIDFILE=/tmp/igmpv2-query.pid

if [ -f "$PIDFILE" ] &&
   kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then

  PID="$(cat "$PIDFILE")"

  kill "$PID"
  rm -f "$PIDFILE"

  echo "Stopped: PID $PID"
else
  rm -f "$PIDFILE"
  echo "Not running"
fi
REMOTE
}


status_remote() {
  ssh "$ROUTER_HOST" 'sh -s' <<'REMOTE'
PIDFILE=/tmp/igmpv2-query.pid
LOG=/tmp/igmpv2-query.log

if [ -f "$PIDFILE" ] &&
   kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then

  echo "RUNNING: PID $(cat "$PIDFILE")"
  echo
  tail -n 5 "$LOG" 2>/dev/null || true
else
  echo "STOPPED"
fi
REMOTE
}


log_remote() {
  ssh "$ROUTER_HOST" \
    'tail -n 20 /tmp/igmpv2-query.log 2>/dev/null || echo "No log found"'
}


case "${1:-}" in
  start)
    start_remote
    ;;

  stop)
    stop_remote
    ;;

  status)
    status_remote
    ;;

  log)
    log_remote
    ;;

  *)
    usage
    exit 1
    ;;
esac
```

## 12. 문제 재현 시 진단 명령

나중에 firmware 업데이트 후 workaround를 끄고 다시 테스트할 때 사용할 수 있도록 명령을 남겨둡니다.

### WAN multicast packet 확인

```bash
tcpdump -ni eth3 -nn \
  'src host 192.0.2.122 and dst host 239.200.50.6 and udp port 49220'
```

### VLAN multicast packet 확인

```bash
tcpdump -ni br50 -nn \
  'src host 192.0.2.122 and dst host 239.200.50.6 and udp port 49220'
```

### WAN IGMP 확인

```bash
tcpdump -ni eth3 -nn -tttt -vv igmp
```

### VLAN IGMP 확인

```bash
tcpdump -ni br50 -nn -tttt -vv igmp
```

### 현재 multicast route 확인

```bash
ip mroute show
```

특정 stream만 확인:

```bash
ip mroute show |
grep -F '(192.0.2.122,239.200.50.6)'
```

정상일 때는 대략 다음과 같습니다.

```text
(192.0.2.122,239.200.50.6)
Iif: eth3
Oifs: br50
State: resolved
```

### kernel multicast cache

```bash
cat /proc/net/ip_mr_cache
```

### bridge MDB

```bash
bridge mdb show |
grep -E '239\.200\.(50\.6|60\.13|60\.43)'
```

### multicast forwarding sysctl

```bash
sysctl net.ipv4.conf.all.mc_forwarding
sysctl net.ipv4.conf.eth3.mc_forwarding
sysctl net.ipv4.conf.br50.mc_forwarding
```

정상 환경에서는 모두 `1`이었습니다.

## 13. 정리

이번 문제에서 가장 도움이 됐던 것은 설정을 계속 바꾸는 것보다 **packet 흐름을 단계별로 나눠서 보는 것**이었습니다.

```text
IPTV upstream
      ↓
Gateway WAN
      ↓
IGMP Proxy / multicast route
      ↓
VLAN bridge
      ↓
Apple TV
```

결과적으로 확인된 핵심은 다음과 같습니다.

1. 화면 정지는 실제 RTP packet loss와 정확히 일치했습니다.
2. 장애는 약 500초 간격으로 반복됐습니다.
3. Gateway가 WAN으로 IGMP Leave를 보낸 직후 stream이 끊겼습니다.
4. Apple TV의 Leave가 최초 원인은 아니었습니다.
5. 장애 중 multicast route가 `resolved`에서 `unresolved`로 변했습니다.
6. IGMP Snooping ON/OFF 모두 동일하게 재현됐습니다.
7. IGMPv2 General Query를 125초마다 추가하자 반복되던 장애가 멈췄습니다.

따라서 현재 환경에서는 **IGMP Proxy의 membership/state aging 문제로 추정되는 현상을 IGMPv2 General Query로 refresh하는 방식**이 실용적인 workaround였습니다.

완전한 해결은 Gateway firmware의 IGMP Proxy 동작이 수정되는 것이겠지만, 그 전까지는 필요할 때 MacBook에서 스크립트를 실행하는 방식이 가장 관리하기 편했습니다.
