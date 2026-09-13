---
title: "Matter 기기 4대가 밤새 Offline이었다: Thread Border Router 추적부터 HAOS 자동 모니터링까지"
date: "2026-09-13"
tags: ["matter", "thread", "home-assistant", "ipv6", "homelab", "troubleshooting"]
summary: "멀쩡하던 Matter 기기 여러 대가 한꺼번에 Offline이 된 뒤 12시간 가까이 회복하지 않았다. Matter Server, Thread Border Router, IPv6 NDP, mDNS/TREL까지 하나씩 확인하고 결국 다음 장애를 자동으로 잡는 HAOS 모니터까지 만든 과정을 정리했다."
---

> **보안 안내**
>
> 이 글에 등장하는 IPv4/IPv6 주소, MAC 주소, Thread 네트워크 이름, Extended PAN ID, 호스트명 등은 모두 공개용 임의값으로 바꿨다.  
> 명령어와 문제 해결 흐름은 실제 과정과 동일하지만, 그대로 복사해도 우리 집 네트워크로 순간이동할 수는 없다. 아쉽다.

어느 날 저녁, Home Assistant를 열어보니 Matter 기기 몇 개가 Offline이었다.

한두 개면 “배터리인가?”, “전구가 삐졌나?” 하고 넘어갈 수 있다. 그런데 이번에는 **4개가 한꺼번에** Offline이었다.

더 이상한 건 다음 날 아침까지도 그대로였다는 점이다.

보통 Thread mesh나 Border Router가 잠깐 재수렴(convergence)하는 문제라면 몇십 초, 길어도 몇 분 안에는 살아날 거라고 생각하기 쉽다. 그런데 이번에는 거의 **12시간**이었다.

이쯤 되면 단순한 “잠깐 끊김”이 아니라, 어딘가에서 꽤 끈질긴 상태가 만들어졌다는 뜻이다.

그래서 하루를 거의 통째로 써서 하나씩 뜯어봤다.

결론부터 말하면 아직 “범인은 이놈입니다”라고 손가락질할 정도의 단일 원인은 잡지 못했다.

대신 꽤 많은 후보를 탈락시켰고, 무엇보다 **다음 장애가 밤에 몰래 일어나도 자동으로 증거를 남기는 감시 장치**를 만들었다.

이 글은 그 과정이다.

## 환경

구성은 대략 이렇다.

```text
Home Assistant OS
        │
        ├── Matter Server
        │
        └── IPv6 / Thread route
                 │
       ┌─────────┼─────────┐
       │         │         │
   Apple TV   Nest Hub A  Nest Hub B
      TBR        TBR         TBR
       │         │         │
       └──── Thread Mesh ───┘
                 │
             Matter 기기 7대
```

Thread Border Router는 총 3대다.

- Apple TV 1대
- Google Nest Hub 2대
- Thread Matter 기기 7대
- Home Assistant OS는 별도 VM
- Matterbridge는 별도 LXC

예시용 주소는 아래처럼 바꿨다.

```text
IoT VLAN       : 10.42.50.0/24
HAOS           : 10.42.50.100

Thread Network : LAB-PAN-42A7
Extended PAN ID: A1B2C3D4E5F60718
Thread OMR     : fdab:cdef:1234::/64

Apple TV       : fe80::a111:22ff:fe33:4401
Workroom Hub   : fe80::b222:33ff:fe44:5502
Living Hub     : fe80::c333:44ff:fe55:6603
```

## 시작은 Matter Server 의심이었다

Matter 기기가 Offline이면 가장 먼저 Matter Server를 의심하기 쉽다.

나도 그랬다.

그런데 로그를 보니 Matter Server는 오히려 꽤 성실하게 일하고 있었다.

대략 이런 흐름이었다.

```text
subscription timeout
→ probe 시도
→ peer 응답 없음
→ address is unreachable
→ availability = false
```

즉 Matter Server가 멀쩡한 기기를 마음대로 Offline으로 만든 게 아니라, **실제로 해당 Thread IPv6 주소에 접근하지 못해서** Offline으로 표시한 쪽에 가까웠다.

더 결정적인 건 HAOS에서 직접 Thread 노드 주소로 ping을 날렸을 때도 실패했다는 점이다.

```bash
ping -6 -c 3 fdab:cdef:1234:0:1111:2222:3333:4441
```

Matter Server 위 계층만 문제가 아니라 **아래쪽 IPv6/Thread forwarding 자체가 깨져 있었다.**

그래서 Matter Server 재시작 버튼에서 손을 뗐다.

문제 해결에서 제일 위험한 버튼은 가끔 “Restart”다.

잘못 누르면 문제도 사라지지만 **증거도 같이 사라진다.**

## Border Router를 하나씩 의심해보기

다음 후보는 Thread Border Router였다.

HAOS에서 특정 Thread 노드로 가는 route를 보면 현재 어떤 Border Router가 next-hop으로 선택됐는지 확인할 수 있다.

```bash
ip -6 route get fdab:cdef:1234:0:1111:2222:3333:4443
```

예를 들면:

```text
fdab:cdef:1234:0:1111:2222:3333:4443
via fe80::b222:33ff:fe44:5502
dev enp0s18
proto ra
metric 105
pref medium
```

여기서 `via`가 현재 선택된 Border Router다.

처음에는 특정 Nest Hub를 켰을 때 한 노드가 반복적으로 실패하고, 그 Hub를 끄자 약 30초 뒤 회복되는 현상이 있었다.

순간적으로는 꽤 강한 느낌이 왔다.

> 찾았다. 범인은 거실 Nest Hub다.

그런데 네트워크 문제는 이렇게 쉽게 끝나주지 않는다.

조금 뒤 같은 Nest Hub를 다시 켰더니 이번에는 HAOS의 route가 실제로 그 Hub를 선택했는데도 **7개 노드가 모두 정상**이었다.

```text
Apple TV
→ Living Room Nest Hub
→ Apple TV
→ Living Room Nest Hub
→ Workroom Nest Hub
```

이렇게 next-hop이 계속 바뀌는데도:

```text
Node 1 : OK
Node 2 : OK
Node 3 : OK
Node 4 : OK
Node 5 : OK
Node 6 : OK
Node 7 : OK
```

였다.

즉,

> “이 Border Router로 route가 잡히면 무조건 죽는다”

라는 단순한 하드웨어 고장 가설은 약해졌다.

## route가 계속 바뀌는데 정상이라고?

처음 보면 약간 불안하다.

```text
12:53:15  Apple TV
12:53:26  Living Room Nest Hub
12:53:36  Apple TV
12:54:07  Living Room Nest Hub
12:54:28  Workroom Nest Hub
```

“왜 이렇게 정신없이 바뀌지?”

하지만 중요한 건 **route가 바뀌는 것 자체가 아니라 바뀔 때 실제 통신이 깨지는가**다.

세 Border Router가 같은 Thread OMR prefix를 Router Advertisement로 제공하고 있고 우선순위도 비슷하면, Linux가 next-hop을 바꾸는 상황 자체는 발생할 수 있다.

현재 관찰에서는:

```text
route 변경
+
Node 1~7 모두 OK
```

였다.

그래서 이건 장애가 아니라 오히려 **다중 Border Router가 제대로 failover 가능한 상태**라고 볼 수 있었다.

## Partition ID라는 아주 그럴듯한 함정

Matter Server의 Border Router diagnostics를 보다가 재미있는 것도 발견했다.

Google Nest Hub의 Partition ID가:

```text
06C6D663
```

Apple TV는:

```text
63D6C606
```

로 보였다.

처음 보면 바로 이런 생각이 든다.

> Apple과 Google이 서로 다른 Thread partition에 들어가 있나?

그런데 두 값을 바이트 단위로 나누면:

```text
Google : 06 C6 D6 63
Apple  : 63 D6 C6 06
```

정확히 역순이다.

게다가 세 Border Router의:

```text
Network Name
Extended PAN ID
Active Timestamp
```

는 동일했다.

실제 `_meshcop._udp` 광고의 `pt` 값도 Apple과 Google에서 같은 4바이트가 반대 순서로 표현되는 모습이었다.

그래서 **Partition ID 표시값 하나만 보고 “네트워크가 둘로 쪼개졌다”고 판단하는 건 위험하다**고 결론 내렸다.

네트워크 진단 화면은 숫자를 많이 보여준다.

문제는 숫자가 많을수록 사람이 자신감을 갖기 쉬워진다는 것이다.

그리고 그 자신감은 종종 잘못된 방향으로 달린다.

## Google Nest Hub가 Home Assistant 목록에 늦게 보이는 이유

또 하나 이상했던 건 Google Nest Hub가 Home Assistant Thread 화면에 가끔 늦게 나타나는 현상이었다.

HA Thread diagnostics를 보니 한 Nest Hub에 여러 ULA IPv6 주소가 남아 있었고, 그중 일부는 이런 상태였다.

```text
lladdr: null
state: FAILED
probes: 6
```

혹시 Google이 이미 사라진 ULA 주소를 계속 광고하는 걸까?

그래서 Home Assistant와 독립된 Matterbridge LXC에서 직접 확인했다.

```bash
ip -6 neigh show dev eth0
```

Nest Hub의 현재 link-local 주소는 정상적으로 보였다.

```text
fe80::c333:44ff:fe55:6603
lladdr 02:33:44:55:66:03
router STALE
```

하지만 HA diagnostics에 남아 있던 ULA는 직접 ping을 발생시키자:

```bash
ULA='fd12:3456:789a:50:1111:2222:3333:4444'

ping -6 -c 3 -W 1 "$ULA"
ip -6 neigh show to "$ULA" dev eth0
```

결과가:

```text
3 packets transmitted, 0 received

fd12:3456:789a:50:1111:2222:3333:4444 INCOMPLETE
```

또 다른 ULA는:

```text
FAILED
```

였다.

반면 NDP 캐시를 지우고 link-local을 다시 확인하면:

```bash
LL='fe80::c333:44ff:fe55:6603'

ip -6 neigh del "$LL" dev eth0 2>/dev/null || true
ping -6 -c 3 -W 1 -I eth0 "$LL"
ip -6 neigh show to "$LL" dev eth0
```

정상적으로:

```text
router REACHABLE
```

로 돌아왔다.

즉 Nest Hub 자체가 LAN에서 사라진 건 아니었다.

**현재 link-local은 정상인데 HA가 알고 있는 오래된 ULA 일부가 이미 사용할 수 없는 상태**였다.

## 그런데 그 stale ULA가 진짜 원인이었을까?

여기서 또 한 번 멈춰야 했다.

Thread node로 가는 HAOS의 실제 next-hop은 이런 ULA가 아니라:

```text
via fe80::c333:44ff:fe55:6603
```

같은 link-local 주소였다.

그리고 그 link-local은 잘 살아 있었다.

그래서 stale ULA는 흥미로운 현상이긴 하지만, **Matter 기기 4대가 12시간 Offline이 된 직접 원인이라고 보기에는 근거가 부족했다.**

다시 말해:

```text
이상한 것 발견
≠
원인 발견
```

네트워크 디버깅에서 가장 자주 빠지는 함정이다.

## mDNS와 TREL도 확인

Google Nest Hub가 실제로 무엇을 광고하는지 보기 위해 Matterbridge LXC에서 Avahi로 직접 확인했다.

먼저 MeshCoP:

```bash
avahi-browse -rt _meshcop._udp
```

그리고 TREL:

```bash
avahi-browse -rt _trel._udp
```

실제 출력에서는 Apple TV와 두 Nest Hub가 모두 정상적으로 발견됐고, 세 장비 모두 같은 Thread network를 광고하고 있었다.

예시:

```text
hostname = [hub-work.local]
address  = [10.42.50.153]
port     = [49154]

hostname = [hub-living.local]
address  = [10.42.50.84]
port     = [49154]

hostname = [border-a.local]
address  = [10.42.50.222]
port     = [49153]
```

IPv6 hostname resolve도 확인했다.

```bash
avahi-resolve-host-name -6 hub-living.local
avahi-resolve-host-name -6 hub-work.local
```

결과는 실제 살아 있는 link-local 주소였다.

```text
hub-living.local  fe80::c333:44ff:fe55:6603
hub-work.local    fe80::b222:33ff:fe44:5502
```

즉 **지금 이 순간의 mDNS / MeshCoP / TREL discovery는 정상**이었다.

Home Assistant의 Thread 설정도:

```text
Preferred network : LAB-PAN-42A7
Thread network     : 1개
Unexpected routers : 없음
Issues              : 없음
```

처럼 깔끔했다.

이쯤 되니 Home Assistant의 단순 설정 실수 가능성도 많이 낮아졌다.

## 그럼 도대체 왜 밤새 Offline이었나

여기가 현재까지 가장 중요한 부분이다.

단순한 “일시적인 route convergence”라면 12시간은 너무 길다.

그래서 현재 가장 잘 맞는 설명은 다음과 같다.

```text
Border Router / Thread topology 변화
        ↓
특정 순간에 잘못된 forwarding 상태 형성
        ↓
일부 Thread node 경로가 unreachable
        ↓
그 상태가 자동으로 쉽게 풀리지 않음
        ↓
Matter Server는 실제 접근 실패를 보고 Offline 유지
```

즉 “잠깐 재수렴하다 실패”라기보다:

> **특정 조건에서 좋지 않은 Thread routing/topology 상태로 수렴한 뒤 그 상태가 오래 고착되는 문제**

쪽이 더 그럴듯하다.

다만 이것도 아직 가설이다.

왜냐하면 어젯밤에는 **실제 IPv6 ping을 밤새 기록하고 있지 않았기 때문**이다.

아침에 Matter가 Offline이었다는 건 알지만:

```text
Thread IPv6도 12시간 내내 죽어 있었는가?
```

아니면:

```text
Thread IPv6는 중간에 살아났는데
Matter session만 복구하지 못했는가?
```

를 구분할 수 없었다.

그래서 마지막에 한 일이 가장 중요했다.

## 사람 대신 밤새 감시하는 HAOS watcher 만들기

더 이상 터미널 앞에 앉아서:

```text
Node 1 : OK
Node 2 : OK
...
```

를 몇 시간씩 보고 있을 수는 없다.

그래서 HAOS host에서 백그라운드로 돌면서:

- 10초마다 Thread 노드 7개 ping
- 정상일 때는 10분마다 heartbeat
- 하나라도 실패하면 즉시 상세 snapshot
- 장애가 계속되면 1분마다 추가 기록
- 복구되면 `RECOVERED` 기록
- 장애 순간의 selected Border Router
- Thread prefix route
- Border Router NDP 상태
- Border Router link-local ping
- Matter Server 최근 로그

를 자동 저장하도록 했다.

> 이 스크립트는 **HAOS host shell**에서 실행한다.  
> Matterbridge LXC나 SSH add-on 컨테이너에서 실행하면 route/NDP 관점이 달라진다.

### 공개용 모니터링 스크립트

아래 주소들은 모두 예시용 임의값이다.

```bash
cat >/mnt/data/matter-watch.sh <<'EOF'
#!/bin/sh

IFACE="enp0s18"
LOG="/mnt/data/matter-watch.log"
TARGET="fdab:cdef:1234:0:1111:2222:3333:4443"

APPLE="fe80::a111:22ff:fe33:4401"
WORK="fe80::b222:33ff:fe44:5502"
LIVING="fe80::c333:44ff:fe55:6603"

POLL=10
SNAPSHOT_INTERVAL=60
HEARTBEAT_INTERVAL=600

LAST_SNAPSHOT=0
LAST_HEARTBEAT=0
WAS_FAILED=0

route_name() {
  case "$1" in
    "$APPLE") echo "Apple TV" ;;
    "$WORK") echo "Workroom Nest Hub" ;;
    "$LIVING") echo "Living Room Nest Hub" ;;
    *) echo "UNKNOWN" ;;
  esac
}

snapshot() {
  REASON="$1"

  {
    echo
    echo "============================================================"
    echo "SNAPSHOT: $REASON"
    echo "TIME    : $(date)"
    echo "============================================================"

    FAILED=""

    for ITEM in \
      '1 fdab:cdef:1234:0:1111:2222:3333:4441' \
      '2 fdab:cdef:1234:0:1111:2222:3333:4442' \
      '3 fdab:cdef:1234:0:1111:2222:3333:4443' \
      '4 fdab:cdef:1234:0:1111:2222:3333:4444' \
      '5 fdab:cdef:1234:0:1111:2222:3333:4445' \
      '6 fdab:cdef:1234:0:1111:2222:3333:4446' \
      '7 fdab:cdef:1234:0:1111:2222:3333:4447'
    do
      set -- $ITEM
      NODE="$1"
      ADDR="$2"

      if ping -6 -c 1 -W 1 "$ADDR" >/dev/null 2>&1; then
        echo "Node $NODE : OK"
      else
        echo "Node $NODE : FAIL"
        FAILED="$FAILED $NODE"
      fi
    done

    echo
    echo "=== SELECTED THREAD ROUTE ==="

    ROUTE="$(ip -6 route get "$TARGET" 2>/dev/null | head -1)"
    VIA="$(echo "$ROUTE" | sed -n 's/.* via \([^ ]*\).*/\1/p')"

    echo "$ROUTE"
    echo "Selected: $VIA [$(route_name "$VIA")]"

    echo
    echo "=== THREAD PREFIX ROUTE ==="
    ip -6 route show table all | grep 'fdab:cdef:1234::/64' \
      || echo "NO THREAD ROUTE"

    echo
    echo "=== BORDER ROUTER NDP ==="
    ip -6 neigh show dev "$IFACE" | grep -E \
      'a111:22ff:fe33:4401|b222:33ff:fe44:5502|c333:44ff:fe55:6603' \
      || echo "NO BR NDP ENTRIES"

    echo
    echo "=== BORDER ROUTER LINK-LOCAL PING ==="

    for ITEM in \
      "Apple-TV|$APPLE" \
      "WorkRoom|$WORK" \
      "LivingRoom|$LIVING"
    do
      NAME="${ITEM%%|*}"
      ADDR="${ITEM#*|}"

      if ping -6 -c 1 -W 1 "${ADDR}%${IFACE}" >/dev/null 2>&1; then
        echo "$NAME : OK"
      else
        echo "$NAME : FAIL"
      fi
    done

    echo
    echo "=== IPv6 NEIGHBOURS ==="
    ip -6 neigh show dev "$IFACE"

    if [ "$REASON" != "HEARTBEAT" ]; then
      echo
      echo "=== MATTER SERVER RECENT LOG ==="
      ha addons logs core_matter_server 2>&1 | tail -n 120
    fi

    echo
    echo "============================================================"
  } >>"$LOG" 2>&1
}

echo "Matter watcher started: $(date)" >>"$LOG"

while true; do
  NOW="$(date +%s)"
  FAILED=""

  for ITEM in \
    '1 fdab:cdef:1234:0:1111:2222:3333:4441' \
    '2 fdab:cdef:1234:0:1111:2222:3333:4442' \
    '3 fdab:cdef:1234:0:1111:2222:3333:4443' \
    '4 fdab:cdef:1234:0:1111:2222:3333:4444' \
    '5 fdab:cdef:1234:0:1111:2222:3333:4445' \
    '6 fdab:cdef:1234:0:1111:2222:3333:4446' \
    '7 fdab:cdef:1234:0:1111:2222:3333:4447'
  do
    set -- $ITEM

    if ! ping -6 -c 1 -W 1 "$2" >/dev/null 2>&1; then
      FAILED="$FAILED $1"
    fi
  done

  if [ -n "$FAILED" ]; then

    if [ "$WAS_FAILED" -eq 0 ]; then
      snapshot "FAIL START - Nodes:$FAILED"
      LAST_SNAPSHOT="$NOW"
      WAS_FAILED=1

    elif [ $((NOW - LAST_SNAPSHOT)) -ge "$SNAPSHOT_INTERVAL" ]; then
      snapshot "FAIL CONTINUES - Nodes:$FAILED"
      LAST_SNAPSHOT="$NOW"
    fi

  else

    if [ "$WAS_FAILED" -eq 1 ]; then
      snapshot "RECOVERED"
      WAS_FAILED=0
      LAST_SNAPSHOT="$NOW"
    fi

    if [ $((NOW - LAST_HEARTBEAT)) -ge "$HEARTBEAT_INTERVAL" ]; then
      snapshot "HEARTBEAT"
      LAST_HEARTBEAT="$NOW"
    fi
  fi

  sleep "$POLL"
done
EOF

chmod +x /mnt/data/matter-watch.sh

nohup /mnt/data/matter-watch.sh >/mnt/data/matter-watch-nohup.log 2>&1 &

echo "PID: $!"
echo "LOG: /mnt/data/matter-watch.log"
```

로그 확인:

```bash
tail -n 300 /mnt/data/matter-watch.log
```

장애 이벤트만 빠르게 검색:

```bash
grep -nE 'FAIL START|FAIL CONTINUES|RECOVERED' /mnt/data/matter-watch.log
```

실시간으로 보고 싶을 때:

```bash
tail -f /mnt/data/matter-watch.log
```

정상 상태에서는 10초마다 7번의 ICMPv6 ping 정도라 부하는 사실상 무시할 수준이다.

## 정상 heartbeat는 이렇게 보인다

```text
SNAPSHOT: HEARTBEAT

Node 1 : OK
Node 2 : OK
Node 3 : OK
Node 4 : OK
Node 5 : OK
Node 6 : OK
Node 7 : OK

=== SELECTED THREAD ROUTE ===
... via fe80::b222:33ff:fe44:5502 dev enp0s18 ...
Selected: fe80::b222:33ff:fe44:5502 [Workroom Nest Hub]

=== THREAD PREFIX ROUTE ===
fdab:cdef:1234::/64 proto ra metric 105 pref medium

=== BORDER ROUTER NDP ===
fe80::b222:33ff:fe44:5502 ... router DELAY
fe80::a111:22ff:fe33:4401 ... router REACHABLE
fe80::c333:44ff:fe55:6603 ... router REACHABLE
```

`DELAY`가 보인다고 놀랄 필요는 없다.

IPv6 NUD(Neighbor Unreachability Detection) 상태에서 다음은 일반적인 흐름이다.

```text
REACHABLE
STALE
DELAY
PROBE
```

정말 신경 써야 할 건:

```text
INCOMPLETE
FAILED
```

가 반복되면서 실제 ping까지 같이 실패하는 경우다.

## 이번에 배운 것

이번 장애는 아직 “완전 해결” 상태가 아니다.

하지만 꽤 많은 걸 배웠다.

### 1. Matter Offline이라고 Matter Server부터 재시작하지 말자

Matter Server가 문제처럼 보여도 실제 원인은 그 아래 Thread/IPv6일 수 있다.

먼저 직접 ping을 해보자.

```bash
ping -6 <Thread node IPv6>
```

이것까지 실패하면 Matter Server만 쳐다볼 이유가 줄어든다.

### 2. Border Router 하나가 수상해 보여도 바로 유죄 판결하지 말자

A/B 테스트에서 한 번 문제가 재현됐다고 해도, 나중에 같은 Border Router가 정상 forwarding을 할 수 있다.

간헐적 mesh 문제는 “장비 고장”보다 훨씬 교묘하다.

### 3. route 변경 자체는 장애가 아니다

```text
Apple TV → Nest Hub → Apple TV → 다른 Nest Hub
```

로 바뀌어도 실제 Thread node가 계속 살아 있으면 정상적인 multi-BR 동작일 수 있다.

### 4. diagnostics의 숫자 하나를 너무 믿지 말자

Partition ID처럼 vendor별 표현 방식이 달라 보일 수 있는 값은 주변 정보와 같이 봐야 한다.

숫자가 다르다고 바로 “partition split!”을 외치면 안 된다.

### 5. stale IPv6 주소는 흥미롭지만 원인과 증거는 다르다

HA diagnostics에 FAILED ULA가 남아 있는 건 분명 이상한 단서였다.

하지만 실제 Thread next-hop은 정상 link-local을 사용했다.

이상한 현상을 발견했다고 해서 바로 원인이라고 부르면 안 된다.

### 6. 가장 좋은 디버깅 도구는 결국 자동 기록이다

사람이 12시간 동안 터미널을 보고 있을 수는 없다.

그리고 이상하게도 장애는 사람이 보는 동안에는 잘 안 난다.

그래서 다음부터는 내가 안 보고 있을 때도:

```text
언제 끊겼는지
어떤 Node가 먼저 죽었는지
그 순간 어떤 Border Router를 쓰고 있었는지
Border Router 자체는 LAN에서 살아 있었는지
Matter Server는 무엇을 기록했는지
언제 회복했는지
```

를 자동으로 남기게 했다.

이제 밤에 Thread가 또 철학적인 고민에 빠져도 아침에 로그만 보면 된다.

## 현재 결론

현재까지 확인된 상태를 정리하면:

```text
Home Assistant Thread 설정      → 특별한 이상 없음
Matter Server                    → 주원인 가능성 낮음
mDNS / MeshCoP discovery         → 현재 정상
TREL discovery                   → 현재 정상
Apple TV Border Router           → 정상 forwarding 확인
Workroom Nest Hub Border Router  → 정상 forwarding 확인
Living Nest Hub Border Router    → 정상 forwarding 확인
일부 과거 ULA                    → NDP 실패 확인, 직접 원인은 불명
다중 Border Router route 변경    → 정상 상태에서도 발생
```

남은 가장 유력한 가설은:

> 특정 조건에서 Thread mesh / Border Router 간 routing 또는 topology가 좋지 않은 상태로 수렴하고, 그 상태가 장시간 고착되는 현상

이다.

하지만 이번에는 준비가 됐다.

다음 장애가 오면 “아 또 Offline이네”로 끝나는 게 아니라, 정확한 시각의 route, NDP, node reachability, Matter Server 로그가 자동으로 남는다.

홈랩에서 문제를 완전히 해결하지 못한 날도 나쁘지 않다.

**다음번에는 문제보다 로그가 먼저 기다리고 있으니까.**
