---
title: "Matter-over-Thread 전체 오프라인 복구: Border Router 변경 뒤 라우팅 수렴 문제 추적"
date: "2026-09-11"
tags: ["matter", "thread", "homeassistant", "ipv6", "smarthome"]
summary: "여러 Thread Border Router를 함께 사용하는 환경에서 Matter 장치가 일시적으로 전부 오프라인된 원인을 IPv6 OMR 경로와 stale route 관점에서 추적한 기록"
---

> 보안 메모: 이 글의 IP, IPv6 prefix, PAN ID, 장치 주소, 노드 이름 등은 모두
> 공개용으로 임의 변경한 값이다. 실제 환경 값과 일치하지 않는다.

## 증상

Home Assistant에서 Matter-over-Thread 장치 여러 대가 한꺼번에 오프라인이
되었다.\
환경에는 Apple TV와 여러 Google Nest Hub가 Thread Border Router(TBR)로 같이
동작하고 있었다.

Thread 네트워크 예시는 다음과 같이 정리했다.

```text
Thread Network : LAB-PAN-7C31
Channel        : 20
PAN ID         : 7c31
XPAN ID        : 90955f00f6456b6f
Mesh-Local     : fd3a:8c4e:2b71:0::/64
Current OMR    : fd7b:4e91:6a20::/64
```

Matter 자격 증명 자체는 남아 있었고, 장치를 초기화하거나 다시 페어링하지 않아도
시간이 지나면서 일부 장치가 자동 복구되기 시작했다.

## 가장 수상했던 것: 예전 IPv6 prefix와 남아 있던 route

장애 시점에 Matter 서버가 장치의 예전 IPv6 주소로 접속을 시도하면서 다음과 같은
상황이 반복됐다.

```text
Resolving (no address known)
```

현재 Thread OMR prefix는 예를 들어 다음과 같았다.

```text
fd7b:4e91:6a20::/64
```

그런데 과거 테스트에서 사용했던 것으로 보이는 별도 prefix 경로가 남아 있었다.

```text
fd91:6a2c:55d0:1::/64 via fe80::abcd:1234:5678:9abc dev enp0s18 proto boot metric 1024
```

반면 정상적인 Thread Border Router가 광고한 경로는 `proto ra`로 들어와 있었다.

```text
fd7b:4e91:6a20::/64 via fe80::1111:2222:3333:4444 dev enp0s18 proto ra metric 100
```

즉, 핵심은 **RA로 자동 학습된 현재 OMR 경로와, 수동/부팅 과정에서 남은 오래된
경로를 구분하는 것**이었다.

## 확인 명령

Home Assistant OS VM 내부에서 IPv6 route를 확인했다.

```bash
ip -6 route
ip -6 route show proto ra
```

오래된 `proto boot` 경로가 실제 현재 Thread topology와 맞지 않는다고 판단한 뒤
제거했다.

```bash
ip -6 route del fd91:6a2c:55d0:1::/64 via fe80::abcd:1234:5678:9abc dev enp0s18
```

여기서 중요한 점은 **현재 정상적으로 생성되는 Thread 관련 ULA prefix를 무작정
지우면 안 된다는 것**이다.

예를 들어 다음 세 종류는 역할이 다르다.

```text
Mesh-Local prefix : fd3a:8c4e:2b71:0::/64
OMR prefix        : fd7b:4e91:6a20::/64
On-link prefix    : fd9e:5b21:7a44:31c2::/64
```

특히 XPANID 기반으로 파생되는 on-link prefix를 Mesh-Local prefix와 혼동하면 안
된다.

## 여러 Border Router가 같은 OMR을 광고해도 정상

처음에는 Apple 계열과 Google 계열 TBR이 서로 다른 prefix를 쓰는 것으로 오해하기
쉬웠다.\
하지만 같은 Thread dataset에 제대로 합류한 뒤에는 여러 Border Router가 같은
favored OMR을 광고하는 것이 정상이다.

최종적으로는 네 개의 TBR이 동일한 OMR 경로를 광고하는 형태로 수렴했다.

```text
fd7b:4e91:6a20::/64 metric 105
  nexthop via fe80::1001 dev enp0s18 weight 1
  nexthop via fe80::1002 dev enp0s18 weight 1
  nexthop via fe80::1003 dev enp0s18 weight 1
  nexthop via fe80::1004 dev enp0s18 weight 1
```

특정 Apple TV를 "메인 Thread Router"나 "Leader"로 강제할 필요는 없다.\
Thread는 여러 Border Router를 자연스럽게 활용하는 구조다.

## 복구 과정에서 확인한 것

Matter 노드 하나는 기존 세션이 잠깐 끊긴 뒤 새로운 OMR 주소로 CASE 세션을 다시
만들며 수백 ms 수준에서 자동 복구됐다.

이런 짧은 offline → online 전환은 topology가 재수렴하는 동안 발생할 수 있다.\
중요한 것은 다음이다.

- 장치 credentials가 그대로 남아 있는가
- 현재 OMR prefix로 새 CASE session이 만들어지는가
- mDNS/IPv6 route가 새 topology에 맞게 갱신되는가
- 같은 증상이 계속 반복되는가

이번에는 공장 초기화나 재페어링 없이 전체 장치가 복구됐다.

## 정리

이번 장애는 Matter credential 손실보다는 **Border Router topology 변경 뒤
OMR/address/mDNS/route 수렴 과정**의 문제로 보는 것이 가장 자연스러웠다.

문제 해결에서 효과적이었던 순서는 다음과 같다.

1. Thread dataset이 같은지 확인
2. 현재 OMR prefix 확인
3. `ip -6 route show proto ra`로 자동 경로 확인
4. 과거 실험에서 남은 stale/static route가 있는지 비교
5. 잘못된 경로만 최소한으로 제거
6. Border Router를 모두 켠 상태에서 재수렴 관찰
7. Matter 장치를 성급하게 factory reset하지 않기

Thread/Matter 문제는 장치부터 다시 페어링하기보다 **IPv6 routing과 Border Router
상태부터 보는 것이 훨씬 안전하다.**
