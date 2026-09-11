---
title: "UniFi IGMP Snooping으로 IPTV 멀티캐스트 확인하기"
date: "2026-09-11"
tags: ["unifi", "igmp", "multicast", "iptv", "smarthome"]
summary: "Apple TV 기반 IPTV가 실제 IGMP 멀티캐스트를 사용하는지 UniFi 게이트웨이에서 tcpdump로 확인하고 IGMP Snooping을 적용한 과정"
---

> 보안 메모: 이 글의 VLAN, 사설 IP, multicast group, 포트, 호스트 주소는 모두
> 임의 변경한 예제 값이다.

## 배경

IoT VLAN에 Apple TV를 두고 IPTV 실시간 방송을 사용하고 있었다.

예제 네트워크:

```text
IoT VLAN       : 154
Subnet         : 10.77.54.0/24
Gateway        : 10.77.54.1
Apple TV       : 10.77.54.72
```

실시간 IPTV가 multicast라면 IGMP Snooping을 켜지 않았을 때 L2 구간에서 불필요한
multicast flooding이 발생할 수 있다.

## IGMP Snooping 설정

UniFi에서 IoT 네트워크에 다음과 같이 적용했다.

```text
IGMP Snooping             : ON
Fast Leave                : OFF
Unknown Traffic Handling  : Auto
Switch Subscription Pool  : All
```

UI에서는 `Querier Selection = Off (3rd Party Switches)`처럼 보였지만, 실제
packet capture에서는 gateway가 IGMPv3 query를 보내고 있었다.

```bash
tcpdump -ni br154 -vv igmp
```

예제 출력:

```text
10.77.54.1 > 224.0.0.1: igmp query v3
```

즉 UI 문구만 보고 "querier가 없다"고 단정하면 안 된다.

## Apple TV가 실제 IGMP join/leave를 보내는지 확인

Apple TV 주소만 필터링했다.

```bash
tcpdump -ni any 'igmp and src host 10.77.54.72'
```

실시간 채널을 바꿀 때마다 IGMP report와 leave가 확인됐다.

```text
leave  239.192.70.11
report 239.192.74.18
report 239.192.82.33
```

이것으로 해당 IPTV 실시간 스트림이 IPv4 IGMP multicast를 사용한다는 것을 확인할
수 있었다.

## 실제 multicast UDP stream 확인

특정 채널에서 선택된 group을 대상으로 capture했다.

```bash
tcpdump -ni br154 -nn 'dst host 239.192.88.21 and udp'
```

예제:

```text
192.168.208.44.4999 > 239.192.88.21.50120: UDP, length 1328
```

`1328` 바이트는 다음처럼 해석될 가능성이 있다.

```text
12 + (188 × 7) = 1328
```

188 byte는 MPEG-TS packet 크기이므로 RTP header + MPEG-TS payload 패턴과 잘
맞는다.\
다만 packet payload를 실제 분석하기 전까지 transport를 확정하지 않는 것이 좋다.

## `any` 인터페이스에서 multicast filter 오류가 나는 이유

다음처럼 link-layer multicast 조건을 `-i any`와 같이 사용하면 오류가 날 수 있다.

```bash
tcpdump -ni any 'host 10.77.54.72 and multicast'
```

Linux의 `any`는 일반 Ethernet 인터페이스와 다른 cooked capture(SLL2)를 사용하기
때문에 일부 link-layer multicast filter가 지원되지 않는다.

이 경우 실제 bridge/interface를 지정하는 것이 낫다.

```bash
tcpdump -ni br154 igmp
```

## 다른 Linux 호스트에서 수신 테스트

IGMP Snooping이 켜져 있다면 단순 `tcpdump`만으로는 multicast packet이 오지 않을
수 있다.\
먼저 receiver가 group join을 해야 switch가 해당 포트로 stream을 전달한다.

예:

```bash
ffprobe -v info \
  -show_streams \
  -show_programs \
  'udp://239.192.88.21:50120?localaddr=10.77.54.90&reuse=1&timeout=5000000'
```

동시에:

```bash
tcpdump -ni eth0 -nn 'dst host 239.192.88.21 and udp port 50120'
```

multi-homed host에서는 `localaddr=`를 지정해 **올바른 VLAN 인터페이스에서 IGMP
join이 나가도록 하는 것**이 중요하다.

## 주의

네트워크 진단 목적으로 multicast group, codec, transport를 확인하는 것은
가능하지만, 암호화/DRM을 우회하는 방향으로 접근해서는 안 된다.

## 결론

이번 확인으로 얻은 핵심은 다음과 같다.

- IPTV live channel은 실제 IGMP multicast를 사용하고 있었다.
- IGMP Snooping을 켜는 것이 VLAN 내 불필요한 flooding을 줄이는 데 유리하다.
- UniFi UI의 querier 표시는 실제 packet capture와 다를 수 있으므로 tcpdump로
  검증하는 것이 좋다.
- Snooping 환경에서는 receiver의 IGMP join 여부가 capture 결과에 직접 영향을
  준다.
