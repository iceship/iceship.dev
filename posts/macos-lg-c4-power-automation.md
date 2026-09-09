---
title: "Mac이 잠들면 LG C4도 끄기: Hammerspoon과 Home Assistant로 전원 자동화 복구하기"
date: "2026-09-09"
tags: ["macos", "hammerspoon", "home-assistant", "lg-webos", "automation"]
summary: "~/bin 로컬 패키지 설치부터 전원 스크립트, Home Assistant 웹훅, Hammerspoon 전체 설정과 복구 순서까지 남기는 LG OLED C4 전원 자동화 기록"
---

LG OLED C4를 Mac에 연결해서 쓰면서, Mac이 잠들면 TV도 꺼지고 Mac을 깨우면 TV도
켜지도록 자동화해두었다. 평소에는 의식하지 않던 기능인데, webOS 업데이트 이후
동작하지 않으니 리모컨을 찾는 일이 다시 생겼다.

기존 WebSocket 제어의 페어링을 복구하려고 몇 가지를 시도했지만 해결되지 않았다.
결국 **끄기는 LG IP Control, 켜기는 Home Assistant의 Wake-on-LAN**으로 나누어
다시 연결했다. 2026년 9월 9일 내 환경에서 확인한 증상과 해결 과정을 정리한다.

나중에 Mac을 다시 설정할 때도 복원할 수 있도록 **설치 위치, 파일 전체 내용,
수정할 값, 확인 순서**까지 남겨둔다. 초기 테스트에서는 저장소의 빌드 결과물을
직접 불러왔지만, 최종 파일을 확인해보니 `~/bin`에 패키지를 로컬 설치해서
`require('lgtv-ip-control')`로 읽는 구성이다. 아래 절차는 이 최종 구성을
기준으로 한다.

> 실제 IP·MAC·제어 키·웹훅 ID는 `<LG_TV_IP>` 같은 자리표시자로 바꾸었다. 실제
> 파일과 대화 기록을 바탕으로 하되, WoL 옵션명과 프로세스 종료 처리,
> Hammerspoon의 Node 실행 방식은 재설정용 예시에서 보완했다. 이 보완본의 실기기
> 동작은 설치 후 아래 순서로 확인해야 한다.

## 업데이트 뒤에 끊긴 것은 페어링이었다

기존 구성은 Hammerspoon이 Mac의 Sleep/Wake 이벤트를 받고, `bscpylgtv` 계열
도구로 TV 화면과 전원을 제어하는 방식이었다. 그런데 업데이트 이후 전원 끄기
명령에서 다음 오류가 발생했다.

```text
401 insufficient permissions (not registered)
```

기존 인증 DB를 제거하고 다시 페어링해도 결과는 같았다.

```text
PyLGTVPairException: Unable to pair
```

먼저 네트워크 단절인지 확인했다. TV의 TCP 3000 포트에는 연결할 수 있었고, 별도의
IP Control 포트인 TCP 9761도 열려 있었다.

| 확인한 항목         | 당시 결과              | 여기서 알 수 있는 것                 |
| ------------------- | ---------------------- | ------------------------------------ |
| 기존 WebSocket 명령 | 등록되지 않았다는 오류 | 기존 인증으로 명령을 실행하지 못함   |
| 새 WebSocket 페어링 | 실패                   | 새 등록도 완료하지 못함              |
| TCP 3000 연결       | 성공                   | 포트가 전면 차단된 상황은 아님       |
| TCP 9761 제어       | 연결 및 전원 끄기 성공 | IP Control을 대안으로 사용할 수 있음 |

업데이트 과정에서 기존 클라이언트 등록 정보가 무효화되었거나 페어링 동작이
달라졌을 가능성은 있다. 다만 펌웨어 내부 원인을 확인한 것은 아니다. **업데이트
이후 문제가 발생했다는 관찰과, 업데이트가 무엇을 바꾸었는지는 구분해서
남겨두기로 했다.**

## 끄기와 켜기를 나눈 이유

내 환경에서는 Mac과 TV가 서로 다른 VLAN에 있다. Mac이 TV의 TCP 포트에 접근할 수
있다고 해서, Mac에서 보낸 WoL 브로드캐스트까지 TV에 도달하는 것은 아니다. 그래서
TV와 같은 네트워크에 있는 Home Assistant에 켜기를 맡겼다.

```text
Mac Sleep
  └─ Hammerspoon
       └─ ~/bin/lgtv-poweroff
            └─ LG IP Control (TCP 9761)
                 └─ TV 대기 상태

Mac Wake
  └─ Hammerspoon
       └─ Home Assistant 웹훅에 POST
            └─ TV와 같은 네트워크에서 WoL 전송
                 └─ TV 켜짐
```

여기서 전원을 끈다는 것은 **전원 공급이 유지되는 대기 상태**로 보내는 것이다.
콘센트를 뽑거나 스마트 플러그로 전기를 차단한 상태를 WoL로 켜는 구성은 아니다.
화면만 끄는 `screen_off`와도 구분해야 한다.

TV에서는 IP Control과 키코드, Wake-on-LAN 설정을 확인했다. Quick Start+와
모바일로 TV 켜기 설정도 활성화한 상태에서 테스트했다. 메뉴 이름과 지원 여부는
모델·webOS 버전에 따라 확인해야 한다.
[프로젝트의 TV 설정 안내](https://github.com/WesSouza/lgtv-ip-control#tv-setup)에도
IP Control 활성화와 키코드 발급, WoL 설정이 설명되어 있다.

## 1. 준비할 값과 완성될 파일 구조

먼저 다음 값을 준비한다. `<...>`는 설명용 표시이므로 실제 값으로 바꿀 때는
꺾쇠까지 제거한다. 문자열을 감싼 따옴표는 남긴다.

| 자리표시자             | 넣을 값                                    | 사용하는 위치                    |
| ---------------------- | ------------------------------------------ | -------------------------------- |
| `<LG_TV_IP>`           | TV의 현재 IP, 가능하면 DHCP 예약으로 유지  | 두 Node 스크립트                 |
| `<LG_TV_MAC>`          | WoL을 받을 TV 네트워크 인터페이스의 MAC    | 두 Node 스크립트, HA             |
| `<LG_TV_KEY>`          | TV의 IP Control 메뉴에서 발급한 키코드     | 두 Node 스크립트                 |
| `<TV_BROADCAST_IP>`    | TV 서브넷의 브로드캐스트 주소              | 직접 WoL 테스트 스크립트         |
| `<HA_BASE_URL>`        | Mac에서 접근할 HA 기본 주소, 끝의 `/` 제외 | Hammerspoon                      |
| `<HA_WAKE_WEBHOOK_ID>` | 직접 생성한 고유한 비밀 웹훅 ID            | HA와 Hammerspoon에 동일하게 입력 |
| `<NODE_PATH>`          | 실제 Node 실행 파일의 절대 경로            | Hammerspoon                      |

브로드캐스트 주소는 TV의 IP와 서브넷 마스크로 결정된다. 무조건 IP 마지막 숫자를
`255`로 바꾸는 방식은 아니다. MAC도 유선과 Wi-Fi가 다를 수 있으므로 실제 연결된
인터페이스의 값을 확인한다.

Mac 쪽에서 만들 파일은 다음과 같다. `~`는 현재 사용자의 홈 폴더다.

```text
~/bin/
├── package.json          # CommonJS 설정과 라이브러리 의존성
├── pnpm-lock.yaml        # 실제 설치 버전 기록, pnpm이 생성
├── node_modules/         # 설치된 패키지, 패키지 매니저가 생성
├── lgtv-poweroff         # 최종 Sleep 경로에서 사용
└── lgtv-poweron          # Mac에서 직접 WoL을 보내보는 테스트용

~/.hammerspoon/
├── init.lua             # Hammerspoon이 처음 읽는 설정
└── lgtv.lua             # Sleep/Wake 감시와 외부 명령 실행
```

**`lgtv-poweron`은 파일이 있어도 최종 Wake 자동화에서 호출하지 않는다.** 내
환경에서 실제로 켜기가 확인된 경로는 Home Assistant 웹훅이었다.

## 2. Node와 Hammerspoon 준비하기

터미널에서 Node와 패키지 매니저를 확인한다.

```bash
node --version
npm --version
pnpm --version
```

당시 대화 기록의 Node는 `v26.8.1`, 실제 설치된 `lgtv-ip-control`은
`4.4.0`이었다. Node가 이미 동작한다면 다시 설치할 필요는 없다. Homebrew가 준비된
새 Mac에서 설치한다면 다음 명령을 사용할 수 있다.

```bash
brew install node
brew install --cask hammerspoon
```

설치 항목은 [Node Formula](https://formulae.brew.sh/formula/node)와
[Hammerspoon Cask](https://formulae.brew.sh/cask/hammerspoon)를 참고한다.
Hammerspoon은 [공식 사이트](https://www.hammerspoon.org/)에서 받아 응용 프로그램
폴더에 넣어도 된다.

Hammerspoon 앱을 실행하고, 앱에서 요청하는 macOS 권한을 설정한다. 메뉴 막대에
아이콘이 보여야 한다. 재부팅 뒤에도 동작하도록 Hammerspoon 설정의 **Launch
Hammerspoon at login**도 켠다. 초기 설정은
[Getting Started](https://www.hammerspoon.org/go/)를 참고한다.

Node 실행 경로도 따로 기록해둔다.

```bash
node -p 'process.execPath'
```

이 결과를 나중에 `lgtv.lua`의 `<NODE_PATH>`에 넣는다. 버전 관리 도구로 설치한
Node는 해당 버전을 삭제하면 경로가 사라질 수 있으므로, Node를 교체할 때 이 값도
다시 확인한다.

## 3. `~/bin`에 패키지를 로컬 설치하기

대화 원문에서는 `npm init -y`로 프로젝트를 만들고 `pnpm add lgtv-ip-control`로
설치했다. 실제 `pnpm-lock.yaml`에도 `4.4.0`이 기록되어 있다. 새로 설정할 때는
다음처럼 당시 라이브러리 버전을 명시할 수 있다.

```bash
mkdir -p ~/bin
cd ~/bin
npm init -y
pnpm add lgtv-ip-control@4.4.0
```

`npm init -y`는 기본 `package.json`을 만드는 명령이고, `pnpm add`가 라이브러리를
설치한다. 글로벌 설치 옵션인 `-g`는 붙이지 않는다.
[npm init 문서](https://docs.npmjs.com/cli/commands/npm-init),
[pnpm add 문서](https://pnpm.io/cli/add)

이후 `~/bin/package.json`을 열어 `"type": "commonjs"`를 넣는다.

```bash
nano ~/bin/package.json
```

최종 파일 내용은 아래와 같다. 이미 다른 도구의 의존성이 있다면 파일 전체를
덮어쓰지 말고 기존 항목에 `type`과 `lgtv-ip-control` 의존성을 반영한다.

```json
{
  "name": "bin",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs",
  "dependencies": {
    "lgtv-ip-control": "^4.4.0"
  }
}
```

`nano`에서는 붙여넣고 `Ctrl+O`, Enter로 저장한 뒤 `Ctrl+X`로 나온다. 이후 파일
작성도 같은 순서다. `main`의 `index.js`는 이 구성에서 만들 필요가 없고, 기본
`test` 스크립트도 TV 테스트와 관계없다. 실행할 파일은 별도로 만드는 두
스크립트다.

pnpm 없이 npm으로 새 구성을 만든다면, 위 `pnpm add` 대신
`npm install lgtv-ip-control@4.4.0`을 실행한다. 이 경우 잠금 파일은
`package-lock.json`이 된다. 기존 pnpm 구성을 복원할 때는 pnpm을 유지한다.

`^4.4.0`은 버전을 완전히 고정하는 표기가 아니다. 재설치할 때 같은 의존성 구성을
복원하려면 `package.json`과 잠금 파일을 함께 보관한다. 기존 잠금 파일로 복원하는
명령은 글 뒤쪽에 따로 정리했다.

설치 확인은 `~/bin`에서 한다.

```bash
cd ~/bin
node -e 'console.log(typeof require("lgtv-ip-control").LGTV)'
```

`function`이 출력되면 라이브러리를 읽은 것이다. TV 전원 명령은 보내지 않는다. 두
실행 파일이 `~/bin`에 있으므로 Node가 그 위치를 기준으로 로컬 패키지를 찾는다.
예전처럼 개인 저장소의 `dist/index.js` 경로를 코드에 넣을 필요가 없다.
[Node의 모듈 탐색 설명](https://nodejs.org/api/modules.html#loading-from-node_modules-folders)

## 4. `~/bin/lgtv-poweroff` 만들기

파일을 열고 다음 내용을 넣는다. 기존 파일을 수정한다면 비공개 위치에 먼저
백업해둔다. **첫 줄의 `#!/usr/bin/env node` 앞에는 빈 줄을 넣지 않는다.**

```bash
nano ~/bin/lgtv-poweroff
```

```javascript
#!/usr/bin/env node
const { LGTV } = require("lgtv-ip-control");

async function main() {
  const tv = new LGTV("<LG_TV_IP>", "<LG_TV_MAC>", "<LG_TV_KEY>");

  try {
    await tv.connect();
    await tv.powerOff();
    process.exit(0);
  } catch {
    // 제어 키나 연결 객체가 섞인 원본 오류는 출력하지 않는다.
    console.error("Failed to power off TV. Check IP, key and TCP 9761.");
    process.exit(1);
  }
}

main().catch(() => {
  console.error("Invalid TV configuration. Check IP, MAC and key.");
  process.exit(1);
});
```

IP·MAC·키를 채운 다음 실행 권한을 부여한다. 실제 파일은 실행 가능한 `755`
권한이었지만, 아래에서는 키가 들어 있는 파일을 본인만 읽고 실행하도록 `700`으로
제한한다. 별도의 `chmod +x`를 실행한 효과도 포함된다.

```bash
chmod 700 ~/bin/lgtv-poweroff
node --check ~/bin/lgtv-poweroff
```

`node --check`가 오류 없이 끝나면 문법 검사는 통과한 것이다. 이제 **TV가 켜진
상태에서** 단독 실행한다.

```bash
~/bin/lgtv-poweroff
echo $?
```

당시에는 종료 코드 `0`과 함께 TV 화면이 꺼지고 빨간 대기 LED가 들어왔다. 첫 줄의
shebang 덕분에 매번 `node`를 앞에 붙이지 않고 실행할 수 있다.

여기서 헤맸던 부분은 두 가지다. 생성자 인수 순서는 **IP, MAC, 키코드**이고,
`powerOff()` 전에 **`await tv.connect()`가 필요하다**. 키를 두 번째 인수로
넣으면 `invalid mac address`, 연결 없이 끄면 `should be connected` 오류가 났다.
[라이브러리 API 문서](https://github.com/WesSouza/lgtv-ip-control/blob/main/packages/lgtv-ip-control/README.md)

## 5. `~/bin/lgtv-poweron` 만들기: 직접 WoL 테스트용

이 파일은 Mac에서 직접 Magic Packet을 보내보려고 만들었다. 최종 운영의 Wake
경로는 다음 절의 Home Assistant지만, 당시 만든 파일의 역할도 남겨둔다.

```bash
nano ~/bin/lgtv-poweron
```

```javascript
#!/usr/bin/env node
const { LGTV, DefaultSettings } = require("lgtv-ip-control");

try {
  const tv = new LGTV("<LG_TV_IP>", "<LG_TV_MAC>", "<LG_TV_KEY>", {
    ...DefaultSettings,
    networkWolAddress: "<TV_BROADCAST_IP>",
  });

  tv.powerOn();
  console.log("WoL requested. Check whether the TV actually turns on.");
  // 즉시 process.exit(0) 하지 않고 UDP 처리가 끝나도록 둔다.
} catch {
  console.error("Failed to request WoL. Check the local TV configuration.");
  process.exitCode = 1;
}
```

```bash
chmod 700 ~/bin/lgtv-poweron
node --check ~/bin/lgtv-poweron
~/bin/lgtv-poweron
```

원래 파일에는 `...DefaultSettings`와 `wol_address`가 들어 있었다. 그런데 실제
설치된 **4.4.0의 Node API가 읽는 이름은 `networkWolAddress`**다. 따라서 위
재설정용 예시는 그 이름으로 고쳤다. 네 번째 인수에 옵션을 전달할 때 기본값도
함께 펼쳐야 한다. 당시 기본값 없이 옵션 하나만 넣었을 때는
`settings.networkPort must be a number greater than 0` 오류가 발생했다.
[기본 설정 소스](https://github.com/WesSouza/lgtv-ip-control/blob/main/packages/lgtv-ip-control/src/constants/DefaultSettings.ts)

또 원래 파일은 `powerOn()` 직후 성공 메시지를 출력하고 `process.exit(0)`으로
종료했다. 이 메서드는 전송 완료를 기다리는 Promise를 반환하지 않고 내부에서
비동기 UDP 전송을 시작하므로, 즉시 종료하면 처리가 중단될 수 있다. 위 예시에서는
강제 종료를 빼고 로그도 요청했다는 뜻으로 바꾸었다.
[WoL 전송 소스](https://github.com/WesSouza/lgtv-ip-control/blob/main/packages/lgtv-ip-control/src/classes/TinySocket.ts)

당시에는 성공 로그가 나와도 TV가 켜지지 않았다. 서로 다른 VLAN이라는 제약에 더해
위 코드 문제도 있었으므로, 그 로그만으로 라우터가 패킷을 버렸다고 확정할 수는
없다. 최종적으로는 **실제 켜짐을 확인한 HA 경로**를 사용했다.

## 6. Home Assistant 웹훅으로 켜기

Mac은 Home Assistant에 HTTP 요청을 보내고, Home Assistant가 TV 쪽 네트워크에
Magic Packet을 전송하도록 했다. 먼저 Home Assistant에 `wake_on_lan` 통합이
설정되어 있어야 한다. YAML로 활성화한다면 `configuration.yaml`에 다음 항목을
둔다.

```yaml
wake_on_lan:
```

아래는 `automations.yaml`에 넣는 형식으로 정리한 예시다. `!secret`으로 참조한
이름은 Home Assistant의 `secrets.yaml`에 직접 정의해야 한다. 두 파일은 Mac의
`~/.hammerspoon`이 아니라 **Home Assistant의 설정 디렉터리**에 있다.

먼저 `secrets.yaml`에 다음 항목을 추가한다. MAC과 웹훅 ID를 실제 값으로 바꾼다.

```yaml
lg_c4_mac: "<LG_TV_MAC>"
lg_c4_wake_webhook_id: "<HA_WAKE_WEBHOOK_ID>"
```

새 웹훅 ID가 필요하다면 Mac 터미널에서 다음처럼 난수를 만들 수 있다. 출력된 값을
`secrets.yaml`에 넣고 나중에 `lgtv.lua`의 웹훅 URL에도 똑같이 사용한다.

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
```

다음 자동화를 `automations.yaml` 목록에 추가한다. 기존 자동화는 유지한다.

```yaml
- id: lg_c4_wake_from_mac
  alias: LG C4 Wake from Mac
  triggers:
    - trigger: webhook
      webhook_id: !secret lg_c4_wake_webhook_id
      allowed_methods:
        - POST
      local_only: true
  actions:
    - action: wake_on_lan.send_magic_packet
      data:
        mac: !secret lg_c4_mac
  mode: single
```

YAML 파일을 직접 관리한다면 `configuration.yaml`에서
`automation: !include automations.yaml`로 파일을 읽는지도 확인한다. 이미 있으면
중복으로 추가하지 않는다. UI의 개별 자동화 YAML 편집기를 쓸 때는 위 목록 항목의
첫 `-`를 제거하고 전체 들여쓰기를 한 단계 줄인 형태로 넣는다.

Home Assistant에서 설정 검사를 통과한 뒤 적용한다. `wake_on_lan:`을 처음
추가했다면 재시작하고, 이미 통합이 로드된 상태에서 자동화만 수정했다면 자동화를
다시 불러온다. 자동화가 활성화되어 있는지도 확인한다.

Home Assistant가 TV의 브로드캐스트 도메인에 패킷을 보낼 수 있어야 한다. 다중
인터페이스나 컨테이너 환경이라면 실행 환경의 네트워크 연결을 먼저 확인하고,
필요하면 TV 서브넷에 맞는 `broadcast_address`를 지정한다.
[Wake-on-LAN 통합 문서](https://www.home-assistant.io/integrations/wake_on_lan/)

웹훅 주소 형식은 다음과 같다. `<HA_BASE_URL>`에는 `http://` 또는 `https://`와
필요한 포트까지 넣고, 마지막에는 `/`를 붙이지 않는다.

```text
<HA_BASE_URL>/api/webhook/<HA_WAKE_WEBHOOK_ID>
```

TV를 대기 상태로 만든 뒤 Mac의 zsh 터미널에서 테스트한다. 아래 `read`는 실제
주소를 명령줄에 직접 남기지 않고 입력받는다. 프롬프트가 나오면 웹훅 주소를
붙여넣고 Enter를 누른다. 입력 중 글자가 보이지 않는 것이 정상이다.

```bash
read -r -s 'ha_wake_url?HA wake webhook URL: '
printf '\n'
curl --fail --silent --show-error \
  --connect-timeout 3 --max-time 10 \
  --request POST "$ha_wake_url"
unset ha_wake_url
```

`--fail`은 HTTP 오류 응답을 실패로 처리하고, 두 timeout 옵션은 연결 및 전체
요청의 대기 시간을 제한한다. [curl 옵션 문서](https://curl.se/docs/manpage.html)

당시에는 이 웹훅을 수동 호출하자 TV가 빨간 LED만 들어온 대기 상태에서도 켜졌다.
이 단계가 성공해야 Hammerspoon의 Wake 연결로 넘어간다. HTTP 요청이 끝났다는 것과
TV가 켜졌다는 것은 다르므로, HA 자동화 실행 기록과 실제 화면까지 확인한다.

## 7. `~/.hammerspoon/init.lua` 만들기

Hammerspoon이 시작할 때 읽는 파일이 `init.lua`다. 폴더와 파일을 준비한다.

```bash
mkdir -p ~/.hammerspoon
nano ~/.hammerspoon/init.lua
```

당시 사용한 내용은 다음과 같다. 이미 다른 자동화가 있다면 기존 내용을 보존하고
아래 설정을 추가한다. `require("lgtv")`는 한 번만 넣는다.

```lua
-- 터미널 IPC 모듈 로드
require("hs.ipc")

-- osascript를 통한 설정 리로드를 사용할 때 허용
hs.allowAppleScript(true)

-- ~/.hammerspoon/lgtv.lua 로드
require("lgtv")
```

`require("lgtv")`가 다음 절에서 만들 파일을 읽는다. `hs.ipc`는 터미널의 `hs`
연동용 모듈이며, 이것만으로 모든 설치 방식에서 `hs` 명령이 PATH에 생긴다는 뜻은
아니다. 이 글에서는 리로드에 메뉴나 `osascript`를 사용한다.

`hs.allowAppleScript(true)`는 외부 AppleScript에서 Hammerspoon의 Lua 코드를
실행할 수 있도록 허용한다. 당시에는 터미널에서 리로드하려고 켰다. 메뉴의 Reload
Config만 사용할 경우 앞의 두 줄을 생략하고 `require("lgtv")`만 두어도 이
자동화를 로드할 수 있다.
[AppleScript 허용 설정](https://www.hammerspoon.org/docs/hs.html#allowAppleScript)

## 8. `~/.hammerspoon/lgtv.lua` 전체 설정

```bash
nano ~/.hammerspoon/lgtv.lua
```

아래 내용을 넣고 **`node_path`와 `ha_wake_webhook_url`을 먼저 채운다.** Node
경로는 앞에서 확인한 `node -p 'process.execPath'`의 출력이다. Lua 문자열의 `~`는
홈 경로로 자동 확장되지 않으므로 Node에는 실제 절대 경로를 넣는다.

이 예시는 실제 파일의 Sleep/Wake·5초 디바운스 구조를 유지한다. 재설정할 때 셸의
PATH를 추측하지 않도록 Node를 절대 경로로 실행하고, task 시작 실패 검사와 curl의
HTTP 오류 처리·제한 시간을 추가했다. 실행 중 task도 테이블에 보관한다.

```lua
local LGTVController = {
    last_sleep_execution = 0,
    last_wake_execution = 0,
    watcher = nil,
    tasks = {}
}

local config = {
    debounce_seconds = 5,
    node_path = "<NODE_PATH>",
    ha_wake_webhook_url =
        "<HA_BASE_URL>/api/webhook/<HA_WAKE_WEBHOOK_ID>",
    debug = true
}

local function log_debug(message)
    if config.debug then
        print("[LGTV] " .. os.date("%H:%M:%S") .. " " .. message)
    end
end

function LGTVController:run_task(name, executable, arguments)
    if self.tasks[name] then
        log_debug(name .. " task is still running; skipping.")
        return
    end

    local task = hs.task.new(executable, function(exitCode)
        self.tasks[name] = nil
        -- URL이나 키가 포함될 수 있는 원본 출력은 로그에 남기지 않는다.
        log_debug(name .. " finished with exit code: " .. tostring(exitCode))
    end, arguments)

    if not task then
        log_debug(name .. " task could not be created.")
        return
    end

    self.tasks[name] = task
    if not task:start() then
        self.tasks[name] = nil
        log_debug(name .. " task could not start; check executable path.")
    end
end

function LGTVController:handle_sleep_event()
    local now = os.time()
    if now - self.last_sleep_execution < config.debounce_seconds then
        log_debug("Skipping sleep execution - debounced.")
        return
    end
    self.last_sleep_execution = now

    log_debug("Mac sleeping. Powering off TV via lgtv-poweroff...")
    local script_path = os.getenv("HOME") .. "/bin/lgtv-poweroff"
    self:run_task("Power off", config.node_path, {script_path})
end

function LGTVController:handle_wake_event()
    local now = os.time()
    if now - self.last_wake_execution < config.debounce_seconds then
        log_debug("Skipping wake execution - debounced.")
        return
    end
    self.last_wake_execution = now

    log_debug("Mac woke up. Triggering HA WoL webhook...")
    self:run_task("HA WoL webhook", "/usr/bin/curl", {
        "--fail", "--silent", "--show-error",
        "--connect-timeout", "3",
        "--max-time", "10",
        "--request", "POST",
        config.ha_wake_webhook_url
    })
end

function LGTVController:start()
    if self.watcher then
        self.watcher:stop()
    end

    local events = hs.caffeinate.watcher
    self.watcher = events.new(function(eventType)
        if eventType == events.screensDidSleep or
           eventType == events.systemWillSleep then
            self:handle_sleep_event()
        elseif eventType == events.screensDidWake or
               eventType == events.systemDidWake then
            self:handle_wake_event()
        end
    end)

    self.watcher:start()
    log_debug("LG TV Sleep/Wake Watcher (HA Webhook + IP Control) started.")
end

LGTVController:start()
return LGTVController
```

저장한 뒤 웹훅 URL이 있는 파일의 읽기 권한을 제한한다. Lua 파일은 Hammerspoon이
읽으므로 실행 권한이 필요하지 않다.

```bash
chmod 600 ~/.hammerspoon/init.lua ~/.hammerspoon/lgtv.lua
```

### 이 코드가 하는 일

이제 두 경로를 Mac의 이벤트에 연결하면 된다. 사용한 이벤트는 다음과 같다.

| Hammerspoon 이벤트                   | 연결한 동작              |
| ------------------------------------ | ------------------------ |
| `screensDidSleep`, `systemWillSleep` | 전원 끄기 스크립트 실행  |
| `screensDidWake`, `systemDidWake`    | Home Assistant 웹훅 호출 |

화면 절전과 시스템 절전 이벤트가 가까운 시점에 들어올 수 있어, Sleep과 Wake
각각에 5초 디바운스를 두었다. 화면 절전도 연결했으므로 Mac 전체가 잠들지 않아도
화면이 절전 상태가 되면 TV를 끈다. 이벤트 정의는
[hs.caffeinate.watcher 문서](https://www.hammerspoon.org/docs/hs.caffeinate.watcher.html)에서
확인할 수 있다.

외부 명령은 `hs.task`로 비동기 실행했다. 다만 비동기 실행이 절전 진입 전에
네트워크 명령을 끝내준다는 보장은 없다. 실제 Sleep/Wake 반복으로 확인해야 하며,
Wake 직후 네트워크 복구가 늦는 환경이라면 제한된 재시도를 별도로 고려할 수 있다.

실제 파일은 `/bin/zsh -c`를 통해 PATH를 보완한 뒤 스크립트를 실행했다.
Hammerspoon은 터미널과 실행 환경이 달라서 Node를 못 찾을 수 있기 때문이다. 위
예시는 `hs.task.new()`에 Node의 절대 경로와 스크립트 인수를 따로 전달하므로 셸의
PATH나 경로의 공백을 위한 따옴표 처리가 필요 없다. 터미널에서 스크립트를 직접
실행할 때만 첫 줄의 `/usr/bin/env node`가 터미널 PATH를 사용한다.
[hs.task 문서](https://www.hammerspoon.org/docs/hs.task.html#new)

한 번은 Sleep은 되는데 Wake만 안 됐다. 이때는 네트워크 문제가 아니라 새 설정에서
`ha_wake_webhook_url`이 `nil`로 빠진 것이 원인이었다. 웹훅 주소를 복원하고 Wake
경로를 다시 연결했다.

또한 5초 디바운스는 같은 방향의 연속 호출을 줄이는 장치다. 5초 안에 여러 번
절전·복귀를 반복하면 필요한 이벤트도 건너뛸 수 있다. 처음 확인할 때는 상태 전환
사이에 충분한 간격을 둔다. 네트워크가 늦게 복구되는 문제를 해결하는 재시도
코드는 위 예시에 포함하지 않았다.

## 9. 리로드하고 전체 흐름 확인하기

처음에는 Hammerspoon 메뉴에서 **Reload Config**를 누른다. `init.lua`의
AppleScript 허용 설정도 이때 적용된다. 이후에는 터미널에서 다음 명령으로 다시
읽을 수 있다.

```bash
osascript -e 'tell application "Hammerspoon" to execute lua code "hs.reload()"'
```

AppleScript가 비활성화되어 있다는 오류가 나면 메뉴로 리로드하거나, `init.lua`의
허용 설정을 확인한다. `hs` CLI 설치 여부는 이 명령과 관계없다.

Hammerspoon 메뉴에서 **Console**을 열어 다음 메시지를 확인한다.

```text
[LGTV] ... LG TV Sleep/Wake Watcher (HA Webhook + IP Control) started.
```

이어서 다음 순서로 테스트한다.

1. TV가 켜진 상태에서 Mac의 Apple 메뉴 → 잠자기를 실행한다.
2. TV가 대기 상태로 바뀌는지 확인하고, 5초 이상 기다린다.
3. Mac을 깨워 TV가 다시 켜지는지 확인한다.
4. 화면 절전에서도 원하는 대로 동작하는지 별도로 확인한다.
5. Mac 재로그인 후 Hammerspoon이 자동 실행되고 감시 시작 로그가 나오는지
   확인한다.

로그는 다음 순서로 나온다. 시각은 생략했다.

```text
[LGTV] Mac sleeping. Powering off TV via lgtv-poweroff...
[LGTV] Power off finished with exit code: 0
[LGTV] Mac woke up. Triggering HA WoL webhook...
[LGTV] HA WoL webhook finished with exit code: 0
```

`0`은 명령이 오류 없이 끝났다는 뜻이다. TV가 실제로 켜졌는지는 별도로 확인한다.
위 코드의 curl은 HTTP 오류에도 실패 코드를 남기지만, 웹훅 호출만으로 실제 TV
전원 상태까지 검증하지는 않는다.

## 10. 나중에 다시 설정할 때의 복원 순서

비공개 백업에 보관할 것은 `~/bin`의 두 실행 파일, `package.json`, 잠금 파일과
Hammerspoon의 두 Lua 파일이다. HA 자동화와 `secrets.yaml`도 HA 백업에 포함한다.
`node_modules`는 잠금 파일을 이용해 다시 설치할 수 있다.

| 상황                        | 다시 할 작업                                                                       |
| --------------------------- | ---------------------------------------------------------------------------------- |
| 새 Mac 또는 macOS 재설치    | Node·Hammerspoon 설치 → 파일 복원 → 의존성 설치 → 권한 설정 → 단독 테스트 → 리로드 |
| `node_modules`가 사라짐     | `~/bin`에서 잠금 파일 기준으로 의존성 재설치                                       |
| Node 버전을 바꿈            | `node -p 'process.execPath'` 재확인 후 `lgtv.lua`의 `node_path` 변경               |
| TV의 IP·네트워크 변경       | 두 Node 파일의 IP·MAC, 필요하면 브로드캐스트 주소와 HA MAC 설정 갱신               |
| TV 제어 키 재발급           | 두 Node 파일의 `<LG_TV_KEY>`에 해당하는 값 갱신                                    |
| HA 이전 또는 웹훅 ID 재발급 | HA 자동화와 `lgtv.lua`의 URL을 함께 갱신하고 수동 호출부터 재확인                  |
| Lua 파일 수정               | Reload Config 실행, Console의 감시 시작 메시지 확인                                |

기존 `package.json`과 `pnpm-lock.yaml`을 복원한 상태에서는 다음 명령을 쓴다.

```bash
cd ~/bin
pnpm install --frozen-lockfile
```

`--frozen-lockfile`은 잠금 파일을 바꾸지 않고 설치하며, `package.json`과 내용이
맞지 않으면 실패한다. 이때 무작정 잠금 파일을 삭제하기보다 두 파일을 같은
백업에서 가져왔는지 먼저 확인한다.
[pnpm install 문서](https://pnpm.io/cli/install)

npm으로 구성해 `package-lock.json`을 보관했다면 대신 다음 명령을 사용한다.

```bash
cd ~/bin
npm ci
```

`npm ci`는 기존 `node_modules`를 정리하고 잠금 파일에 맞춰 다시 설치한다. 잠금
파일이 없는 최초 설치에는 앞에서 설명한 `npm install`을 쓴다.
[npm ci 문서](https://docs.npmjs.com/cli/commands/npm-ci)

복원 후 실행 파일과 설정 파일의 권한도 다시 확인한다.

```bash
chmod 700 ~/bin/lgtv-poweroff ~/bin/lgtv-poweron
chmod 600 ~/.hammerspoon/init.lua ~/.hammerspoon/lgtv.lua
```

마지막으로 **OFF 단독 → HA 웹훅 ON 단독 → Hammerspoon 전체 연결** 순서로
확인한다. 파일을 복사했다는 것만으로 자동 실행까지 복원된 것은 아니다.

## 11. 다시 만날 수 있는 오류

| 증상                                                   | 먼저 확인할 것                                                                           |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `Cannot find module 'lgtv-ip-control'`                 | `~/bin`의 `package.json`·잠금 파일·로컬 설치 여부. 글로벌 설치로 대체하지 않기           |
| `require is not defined`                               | `~/bin/package.json`의 `"type": "commonjs"`                                              |
| `invalid mac address`                                  | 생성자의 두 번째 인수가 MAC인지, 자리표시자를 실제 값으로 바꿨는지                       |
| `should be connected`                                  | `await tv.connect()` 다음에 `await tv.powerOff()`가 있는지                               |
| `settings.networkPort must be a number greater than 0` | 사용자 지정 옵션 앞의 `...DefaultSettings`                                               |
| WoL 요청 로그는 나오는데 TV가 안 켜짐                  | 실제 전송 완료를 뜻하는 로그인지, `networkWolAddress`·MAC·TV 설정·네트워크 경로가 맞는지 |
| 터미널에서는 OFF가 되는데 자동화에서는 실패            | Hammerspoon의 `node_path`, task 시작 오류, 절전 전 네트워크 상태                         |
| OFF만 되고 ON이 안 됨                                  | `ha_wake_webhook_url` 누락·오타, HA 자동화 활성화와 실행 기록                            |
| curl 종료 코드 `22`                                    | HTTP 오류 응답. 메서드·접근 제한·HA 및 프록시 응답 확인                                  |
| curl 종료 코드 `28`                                    | 제한 시간 초과. Wake 후 네트워크 복구와 HA 접근 상태 확인                                |
| 시작 로그가 안 나옴                                    | Hammerspoon 실행 여부, `init.lua`의 `require("lgtv")`, Lua 문법 오류와 리로드 여부       |

포트 연결 확인이 필요하면 `<LG_TV_IP>`를 바꾸고 다음 명령을 실행한다.

```bash
nc -zv -G 2 '<LG_TV_IP>' 9761
```

TV가 켜진 상태에서 확인하는 것이 좋다. TCP 연결 성공은 해당 포트에 도달했다는
뜻이지, 키 인증이나 전원 명령까지 성공했다는 뜻은 아니다. HTTP 오류 코드와 curl
종료 코드는
[curl 종료 코드 설명](https://curl.se/docs/manpage.html#EXIT-CODES)으로 구분해서
확인할 수 있다.

## 12. 공개할 때는 웹훅 주소도 비밀번호처럼 다루기

Home Assistant 웹훅은 유효한 ID를 아는 것 외에 별도 인증을 요구하지 않는다.
따라서 웹훅 URL은 단순한 내부 주소가 아니라 **자동화를 실행할 수 있는
비밀값**이다. 공개 예시의 ID를 재사용하지 않고, 추측하기 어려운 고유 ID를 만들어
보관해야 한다. 위 예시는 요청 메서드를 POST로 제한하고 `local_only: true`를
유지했다.
[웹훅 보안 문서](https://www.home-assistant.io/docs/automation/trigger/#webhook-security)

`local_only`를 특정 Mac만 허용하는 방화벽 규칙으로 생각해서는 안 된다. 운영할
때는 VLAN 간 접근을 필요한 출발지와 목적지·포트로 제한하고, TV 제어 포트나 이
웹훅을 인터넷에 공개하지 않는 편이 좋다. HTTP로 호출하면 웹훅 경로가 평문으로
전달되므로, 신뢰할 수 없는 구간을 통과한다면 HTTPS 등으로 전송 경로도 보호해야
한다.

이 글은 공개용 자리표시자만 포함하지만, 값을 채운 두 실행 파일과 `lgtv.lua`는
비밀값을 담은 로컬 파일이 된다. GitHub·블로그·공개 백업에 올리지 않는다. 위 권한
설정은 로컬의 다른 일반 사용자에게 읽기를 제한하는 것이며 암호화는 아니다.
로그나 스크린샷에도 웹훅 URL·키·원본 오류 객체가 들어가지 않도록 한다.

수동 테스트의 숨김 입력은 셸 기록에 URL을 직접 남기지 않기 위한 것이다. curl에
전달한 URL은 실행 중 프로세스 인자에서 보일 수 있으므로, 로컬 관리자나 같은
계정의 프로세스로부터 비밀값을 숨겨주는 방식은 아니다.

비밀값을 별도 파일로 옮기는 것은 저장소에 함께 올리지 않을 때 의미가 있다. Home
Assistant의 `secrets.yaml`도 암호화 저장소는 아니므로 파일 접근과 백업을
관리해야 한다. 이미 공개한 키나 웹훅 ID가 있다면 글에서 지우는 것과 별개로
재발급해야 한다.
[Home Assistant의 비밀값 분리 안내](https://www.home-assistant.io/docs/configuration/secrets/)

이번에는 기존 WebSocket 페어링 문제를 해결하지 못했지만, 전원 끄기와 켜기를 각각
동작이 확인된 경로에 연결해 자동화를 복구했다. 이후 같은 증상이 생겨도 두 경로를
독립적으로 시험할 수 있다는 점이 관리하기 편해졌다.
