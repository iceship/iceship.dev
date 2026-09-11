---
title: "Proxmox 노드가 갑자기 사라지고 IO Pressure가 60%까지 튄 사건 추적"
date: "2026-09-11"
tags: ["proxmox", "linux", "zfs", "nvme", "troubleshooting"]
summary: "노드가 ARP 응답까지 멈춘 시점과 IO Pressure Stall 급등을 비교하고 NVMe, ZFS, 예약 작업, 네트워크 스토리지 가능성을 순서대로 점검한 기록"
---

> 보안 메모: 내부 IP, 노드명, 장치 식별자, 시리얼, 작업 ID 등은 제거하거나 임의
> 값으로 대체했다.

## 사건 타임라인

문제 노드 `hv-c`가 약 08:42경 갑자기 사라졌다.

그 시점의 Proxmox `IO Pressure Stall` 그래프는 평소 거의 0%이던 값이 순간적으로
약 60%까지 상승했다.

관찰한 흐름은 대략 다음과 같았다.

```text
08:41까지      정상
08:42 전후     IO Pressure 급등 (~60%)
08:42 직후     host 응답 중단
               ARP neighbor = FAILED
               ping/SSH 불가
08:58경        수동 재부팅
재부팅 후      정상 복귀
```

## IO Pressure가 의미하는 것

Linux PSI(Pressure Stall Information)의 I/O pressure는 task들이 I/O completion을
기다리느라 실행되지 못한 시간을 나타낸다.

따라서 60%라는 숫자는 "디스크 사용률 60%"가 아니다.

가능한 원인은 여러 가지다.

- 로컬 NVMe controller stall
- ZFS I/O stall
- NFS/PBS 같은 network storage 지연
- PCIe 계층 문제
- kernel 전체 hang 직전의 2차 증상

그래프 하나만으로 NVMe 고장이라고 단정하면 안 된다.

## 장애 boot를 정확한 Boot ID로 확인

재부팅이 여러 번 있었기 때문에 `journalctl -b -1`만 믿으면 엉뚱한 boot를 볼 수
있다.

먼저:

```bash
journalctl --list-boots
```

장애가 있었던 boot ID를 선택한 뒤 정확히 지정한다.

```bash
BOOT=<sanitized-boot-id>

journalctl --boot=$BOOT -k \
  --since "2026-09-11 08:38:00" \
  --until "2026-09-11 08:43:00" \
  -o short-precise --no-pager
```

이번에는 장애 직전 해당 시간대의 kernel log가 아예 남아 있지 않았다.

이것은 원인을 증명하지는 않지만, 시스템이 너무 급격히 멈춰 journal까지 쓰지
못했을 가능성도 고려하게 만든다.

## NVMe 상태 확인

호스트의 NVMe는 2TB급 고성능 SSD였다.

확인:

```bash
nvme smart-log /dev/nvme0
nvme error-log /dev/nvme0 -e 64
smartctl -x /dev/nvme0
```

관찰 결과는 매우 깨끗했다.

```text
critical_warning      : 0
temperature           : 정상 범위
available_spare       : 100%
percentage_used       : 0%
media_errors          : 0
num_err_log_entries   : 0
error log             : No Errors Logged
```

다만 `unsafe_shutdowns` 값은 0보다 컸다.

이것은 SSD 불량을 뜻하지는 않지만, 과거에도 정상 shutdown이 아닌 reset/power
loss가 여러 차례 있었다는 운영 단서다.

## ZFS 상태

```bash
zpool status -v
zpool status -x
```

결과:

```text
pool state : ONLINE
READ       : 0
WRITE      : 0
CKSUM      : 0
data error : 없음
```

즉 현재 증거로는 NAND media error나 ZFS data corruption 가능성은 낮았다.

## 예약 작업이 원인이었는지 확인

다음도 확인했다.

```bash
pvenode task list --limit 100
cat /etc/pve/jobs.cfg
pvesr status
systemctl list-timers --all | grep -Ei 'trim|scrub|zfs|pve|backup'
```

장애 시간대인 08:42 부근에는 backup, replication, trim, scrub 같은 작업이
시작되지 않았다.

예를 들어:

```text
vzdump      02:10
apt update  04:17
replication 05:05~05:07
fstrim      며칠 전 실행
```

이었다.

따라서 "08:42 예약 backup 때문에 I/O가 폭증했다"는 가설은 약해졌다.

## 현재 우선순위 가설

증거를 종합하면 현재는 다음 순서로 보고 있다.

```text
1. NIC / network recovery 문제
2. NFS/PBS 등 network storage I/O stall
3. kernel / PCIe 계층 hang
4. NVMe controller transient stall
5. 실제 SSD media failure
```

특히 node가 단순히 Proxmox 서비스만 죽은 것이 아니라 **ARP 응답까지 사라졌다는
점**이 중요하다.

로컬 SSD만 느려졌다면 반드시 NIC까지 사라지는 것은 아니기 때문에, network
flap이나 host/kernel 전체 hang 가능성을 함께 봐야 한다.

## 다음에 같은 증상이 생기면 바로 확인할 것

### 1. 다른 노드에서 L2 상태

```bash
ping -c 3 10.77.14.23
ip neigh show 10.77.14.23
```

`FAILED`면 ARP 응답부터 없는 상태다.

### 2. NIC / driver / PCIe

```bash
journalctl -k | grep -Ei \
'r816|NETDEV|link.*down|link.*up|carrier|watchdog|tx timeout|reset|AER|PCIe|ethernet|enp|eno'

lspci -nnk | grep -A4 -Ei 'Ethernet controller|Network controller'
```

### 3. network storage

```bash
mount | grep -Ei 'nfs|cifs'
pvesm status

journalctl --since "-10 min" | grep -Ei \
'nfs|server not responding|rpc|pbs|storage|timeout|timed out|blocked'
```

### 4. local storage

```bash
zpool status -v
nvme smart-log /dev/nvme0
nvme error-log /dev/nvme0
```

## 다음 장애를 위한 관측 개선

이번처럼 hard hang에 가까운 장애는 local journal에 결정적인 로그가 남지 않을 수
있다.

다음 단계로는 다음을 고려할 만하다.

- remote syslog/journal forwarding
- Prometheus/node_exporter로 PSI, disk latency, network error 수집
- NVMe health metric 수집
- NIC link state / driver reset alert
- Proxmox HA 상태 alert
- 별도 노드에서 ping/ARP health check
- pstore/ramoops 또는 kernel crash dump 검토

핵심은 **죽은 뒤 local disk에서 증거를 찾는 방식만으로는 한계가 있다는 것**이다.

## 현재 결론

이번 사건에서 SSD 자체가 망가졌다는 증거는 발견되지 않았다.

오히려:

```text
IO Pressure 급등
+ 장애 직전 kernel log 부재
+ ARP 응답까지 중단
+ 재부팅 후 정상
+ NVMe/ZFS health 정상
+ 장애 시각에 예약 I/O 작업 없음
```

이라는 조합 때문에 **host/network/PCIe 계층의 순간적인 hang 또는 network storage
stall**을 더 우선적으로 추적하고 있다.

아직 원인을 확정하지 않았기 때문에, 현재 단계에서는 kernel parameter나 NVMe
power setting을 성급하게 바꾸지 않고 다음 재현 시 더 많은 telemetry를 확보하는
방향이 안전하다.
