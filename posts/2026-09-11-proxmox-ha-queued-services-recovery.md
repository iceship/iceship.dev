---
title: "Proxmox HA 리소스가 queued에 멈췄을 때: CRM/LRM 복구와 ZFS Replication 점검"
date: "2026-09-11"
tags: ["proxmox", "ha", "corosync", "zfs", "replication", "lxc"]
summary: "Proxmox 4노드 클러스터에서 한 노드 장애 후 HA LXC가 queued 상태에 머문 원인과 pve-ha-crm/pve-ha-lrm 정상화 과정"
---

> 보안 메모: 노드명, VMID/CTID, 사설 IP, replication 대상 등은 공개용으로 임의
> 변경했다.

## 상황

4노드 Proxmox 클러스터에서 한 노드가 갑자기 응답하지 않았다.

예제 구성:

```text
hv-a  10.77.14.21
hv-b  10.77.14.22
hv-c  10.77.14.23   # 장애 노드
hv-d  10.77.14.24
```

문제 노드가 사라졌지만 나머지 세 노드는 quorum을 유지했다.

```text
Expected votes: 4
Total votes:    3
Quorum:         3
Quorate:        Yes
```

따라서 cluster 자체를 제거하거나 expected votes를 임의 변경할 상황은 아니었다.

## L2 단계에서 노드가 안 보였다

다른 노드에서 문제 노드의 neighbor 상태가 다음처럼 나왔다.

```bash
ip neigh show 10.77.14.23
```

```text
10.77.14.23 dev vmbr1 FAILED
```

이 상태는 같은 L2 network에서 ARP 응답조차 받지 못했다는 뜻이다.

동시에:

```text
ping  -> Destination Host Unreachable
SSH   -> timeout
pvecm -> hv-c 없음
```

이었다.

단순 Proxmox GUI 문제나 corosync 문제보다 더 아래 계층의 host/network 장애를
의심해야 하는 상황이었다.

## 재부팅 후 노드는 살아났지만 HA LXC가 시작되지 않았다

문제 노드를 재부팅한 뒤 host는 정상 복귀했다.\
하지만 HA로 등록한 세 LXC는 계속 stopped였고 HA 상태는 다음과 같았다.

```text
quorum OK
fencing standby (CRM watchdog standby)

service ct:210 (hv-c, queued)
service ct:211 (hv-c, queued)
service ct:212 (hv-c, queued)
```

`pct start`를 실행해도 실제 start가 아니라:

```text
Requesting HA start for CT 210
```

만 출력됐다.

이유는 HA-managed resource이기 때문이다. `pct start` 요청은 HA stack으로
넘어가고, CRM/LRM이 실제 start를 수행해야 한다.

## 원인: HA daemon이 꺼져 있었다

노드에서 확인했다.

```bash
systemctl is-active pve-ha-crm pve-ha-lrm
systemctl is-enabled pve-ha-crm pve-ha-lrm
```

문제 상태:

```text
inactive
inactive
disabled
disabled
```

HA resource 설정은 존재했지만 실제 HA engine이 동작하지 않아 request가
`queued`에 머문 것이다.

## HA 서비스 정상화

모든 cluster node에서 HA daemon 상태를 확인한 뒤 HA를 계속 사용할 계획이라면 각
노드에서 서비스를 활성화한다.

```bash
systemctl enable --now pve-ha-crm pve-ha-lrm
```

클러스터 전체에서 정상화된 뒤:

```bash
ha-manager status
```

예제 정상 상태:

```text
quorum OK
master hv-a (active, ...)
fencing armed (CRM watchdog active)

lrm hv-a (idle, watchdog standby, ...)
lrm hv-b (idle, watchdog standby, ...)
lrm hv-c (active, watchdog active, ...)
lrm hv-d (idle, watchdog standby, ...)

service ct:210 (hv-c, started)
service ct:211 (hv-c, started)
service ct:212 (hv-c, started)
```

그리고 실제 LXC도 `running`으로 돌아왔다.

## local-zfs인데 HA가 가능한가?

세 LXC의 rootfs는 모두 `local-zfs`였다.

```text
ct:210 -> local-zfs:subvol-210-disk-0
ct:211 -> local-zfs:subvol-211-disk-0
ct:212 -> local-zfs:subvol-212-disk-0
```

처음 보면 "local-zfs니까 다른 노드 failover가 불가능한 것 아닌가?"라고 생각하기
쉽다.

하지만 이 환경에는 ZFS replication이 이미 구성되어 있었다.

```text
JobID   Target
210-0   local/hv-d
211-0   local/hv-d
212-0   local/hv-d
```

즉 **local ZFS + Proxmox Storage Replication + HA** 조합이다.

다만 replication은 비동기이므로 마지막 sync 이후의 변경분은 failover 시 유실될
수 있다.\
상태 변화가 잦은 MQTT 같은 서비스는 replication interval을 workload 특성에 맞게
짧게 잡는 것이 좋다.

## 운영 체크리스트

HA를 쓴다면 최소한 다음은 정기적으로 확인하는 편이 좋다.

```bash
ha-manager status
pvecm status
pvesr status
systemctl is-active pve-ha-crm pve-ha-lrm
```

정상 기준:

```text
quorum       OK
master       active
fencing      armed
각 node LRM   active 또는 idle
HA service   started
replication  OK
```

## 이번 장애에서 배운 점

`HA resource가 등록되어 있다`와 `HA가 실제로 동작한다`는 완전히 다른 이야기다.

`queued`가 장시간 유지되면서 `CRM watchdog standby`가 보이면 먼저 CRM/LRM
daemon을 확인해야 한다.

그리고 `pct start`를 반복하기보다:

```text
HA config
  ↓
CRM master
  ↓
LRM
  ↓
fencing/watchdog
  ↓
storage availability / replication
```

순서로 보는 것이 훨씬 빠르다.
