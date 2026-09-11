---
title: "Proxmox LXC Console root 자동 로그인 설정"
date: "2025-11-27"
tags: ["proxmox", "lxc", "linux"]
summary: "Proxmox 웹 GUI 콘솔(noVNC)에서 LXC 컨테이너 연결 시 비밀번호 없이 root로 자동 로그인하는 방법"
---

![Proxmox Console Auto Login](/images/blog/proxmox-console-autologin-1764207566256.webp)

## Proxmox에서

[Proxmox VE Helper-Scripts](https://community-scripts.github.io/ProxmoxVE/scripts)에서
Proxmox 처음 배울 때 많은 도움을 받았고 지금도 여기에서 만든 스크립트로 서비스를
운영하고 있는데, Helper-Scripts로 만든 LXC는 root 자동 로그인이 된다.

가끔 여기에 없는 따로 LXC를 만들면 Proxmox web에서 lxc console 연결 시, root
password를 입력해야 되어서(당연한거지만...) 내부에서만 사용하는 환경이어서
어떻게 root password없이 web console에서 연결할 수 있을까 찾아보니

### LXC 컨테이너에 적용할 명령어

Proxmox shell에서

```bash
pct enter <ID>
```

으로 연결 후, 해당 LXC에서:

```bash
# 1. 설정 폴더 생성
mkdir -p /etc/systemd/system/container-getty@1.service.d

# 2. override.conf 파일 생성
cat > /etc/systemd/system/container-getty@1.service.d/override.conf <<'EOF'
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin root --noclear --keep-baud tty%I 115200,38400,9600 $TERM
EOF

# 3. 설정 적용 및 재부팅
systemctl daemon-reload

reboot
```

그럼 이제 Proxmox web GUI console에서도 root로 자동 로그인이 되는 걸 확인할 수
있다.

```bash
systemctl cat container-getty@1.service
```

기존 설정과 비교해 볼 수 있다.
