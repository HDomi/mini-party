# mini-party

친구들끼리 하는 미니 파티게임 모음. React + Vite + SCSS로 만들고, Firebase Realtime Database로 동기화하며, GitHub Pages에서 호스팅한다.

- 메인화면(`/`)에서 게임을 고르거나, 방 코드만 넣으면 그 방의 게임으로 바로 들어간다
- 방 통신(구독, 입장·재접속, 호스트 승계, 게임 transaction)은 게임끼리 공유한다. [게임 추가](#게임-추가) 참고
- 이미 시작한 방에 링크로 새로 들어오면 먼저 알리고 관전하게 한다. 이번 판이 끝나 로비로 돌아가면 자리에 앉는다. 원래 참가자는 재접속하면 바로 자기 자리로 돌아간다
- 번들 전체를 빌드 시점에 비밀번호로 암호화한다

게임:

- **윷놀이**(`/yut`): 3D(react-three-fiber), 2~6명, 개인전 또는 팀전(2~3팀), 팀당 말 2~5개. 방 코드 + 공유 링크(`/yut/ABCD`), 재접속해도 유지되는 자리, 관전자. 봇과 1:1(`/yut/bot`, 쉬움 / 보통 / 어려움)은 탭 안에서만 진행되며 DB 트래픽이 없다
- **오목**(`/omok`): 3D(react-three-fiber), 흑백 2명 + 관전자. 렌주룰(흑 삼삼·사사·장목 금지, 판에 × 로 표시) 또는 자유룰. 한 판 더 하면 흑백이 바뀐다. 상대가 15초 넘게 나가 있으면 기권 처리된다. 봇과 1:1(`/omok/bot`, 쉬움 / 보통 / 어려움, 무르기 가능)은 탭 안에서만 진행된다
- **포격전**(`/tank`): 2D 캔버스 포격 게임, 2~4명 + 관전자. 개인전(1:1:1:1) 또는 팀전(빨강팀·파랑팀, 2:2까지, 번갈아 쏜다). 맵 3종을 로비에서 썸네일로 고른다: 언덕 평야, 바위 상자(정사각형 안에 무작위 씨앗으로 자란 바위들, 바닥이 없어 떨어지면 탈락), 세 섬(아래는 바다, 탱크 몸체 절반 이상이 잠기면 파괴, 바다에 떨어진 포탄은 터지지 않음). 판마다 지형이 새로 생성된다. 폭발은 원 모양으로 땅을 파고 흙은 무너지지 않는다(중력은 포탄과 탱크만 받는다). 바람, 연료 제한 이동, 무기 4종(기본탄 무제한, 대형탄·3연발·굴착탄 2발씩), 낙하 피해. 차례는 30초, 차례인 사람이 나가 있으면 8초 뒤 넘어간다. 한 판 더 하면 새 지형에서 먼저 쏘는 사람이 바뀐다. 전장은 드래그(마우스·한 손가락)로 옮기고 휠·핀치로 확대/축소하며, 오른쪽 버튼으로 내 탱크 확대·맵 전체 보기·기본 보기를 고른다(더블클릭·더블탭도 기본 보기). 봇 1~3대와 대전(`/tank/bot`, 쉬움 / 보통 / 어려움, 봇 3대면 2:2 팀전 가능)은 탭 안에서만 진행된다

## 개발

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # 규칙·통신·라우터 테스트
```

`VITE_FIREBASE_DATABASE_URL`이 없으면 로컬 백엔드를 쓴다. 같은 브라우저에서 탭을 여러 개 열면 탭마다 별도 플레이어가 된다.

실제 DB로 테스트하려면 `.env.local`을 만든다.

```
VITE_FIREBASE_DATABASE_URL=https://<instance>.firebaseio.com
VITE_DB_KEY=<DB의 /miniparty_key 와 같은 값>
```

## 배포

`main`에 푸시하면 `.github/workflows/deploy.yml`이 실행되어 `https://hdomi.github.io/mini-party/`에 배포된다.

URL에 `#`을 쓰지 않는다(`src/router`, History API). GitHub Pages는 SPA fallback이 없으므로 `npm run build`가 `dist/index.html`을 `dist/404.html`로도 복사한다. 없는 경로(`/mini-party/yut/ABCD`)로 들어오거나 새로고침하면 Pages가 `404.html`을 주고, 그 안에서 같은 앱이 떠 경로를 읽는다. 응답 상태코드는 404지만 화면은 정상이다. 라우트 이름은 `dist` 안의 실제 폴더(`assets`, `sfx`)와 겹치면 안 된다.

저장소 설정:

- Settings → Pages → Source: **GitHub Actions**
- Secrets(repo 또는 `github-pages` environment):
  - `FIREBASE_DATABASE_URL` — RTDB URL(번들에 포함되지만 암호화됨)
  - `DB_KEY` — 방 경로에 쓰는 비밀 경로 세그먼트(번들에 포함되지만 암호화됨). sweep 잡에서도 필요하므로 repo 레벨로 둔다. [DB 규칙](#db-규칙) 참고
  - `PLAY_PW` — 입장 비밀번호, 빌드 시점에만 사용

CI에서 `PLAY_PW`가 비어 있거나, 비밀번호 문자열이 `dist/` 어딘가에 나타나거나, `DB_KEY`가 없거나 형식이 잘못되면 빌드가 실패한다.

## 방 정리

- 마지막으로 나가는 플레이어가 방을 삭제한다.
- 각 플레이어의 `onDisconnect`가 `lastSeen`을 기록하므로, 탭을 닫거나 연결이 끊겨 빈 방에도 타임스탬프가 남는다.
- `.github/workflows/sweep-rooms.yml`이 매시간 `scripts/sweep-rooms.ts`를 실행해 30분 동안 아무도 접속하지 않은(또는 24시간 동안 변경이 없는) 방을 삭제한다. Actions 탭에서 `dry_run`으로 수동 실행하면 무엇이 삭제될지 미리 볼 수 있다.

sweep 잡은 `github-pages` environment를 쓰지 않으므로 **repo 레벨** secrets가 필요하다.

- `FIREBASE_SERVICE_ACCOUNT_JSON` — 서비스 계정 키 JSON(Firebase console → Project settings → Service accounts → Generate new private key)
- `FIREBASE_DATABASE_URL` — 위와 동일(repo 레벨 secret 또는 variable)
- `DB_KEY` — 위와 동일

GitHub는 저장소 활동이 60일간 없으면 예약 워크플로를 일시 중지한다. 그런 경우 Actions 탭에서 다시 활성화한다.

방 밖에서는 마지막 리스너나 쓰기가 끝나고 2초 뒤 클라이언트가 RTDB 소켓을 닫는다(`goOffline`). 따라서 홈 화면에 띄워 둔 탭은 Spark 요금제의 동시 연결 100개 한도에 포함되지 않는다.

## 사운드

`src/audio/sound.ts`가 Web Audio로 효과음을 재생한다(배경 음악은 연결만 해 두고 지금은 주석 처리). 볼륨은 0에서 시작하며 `localStorage`(`party:volume`)에 저장되고, 오른쪽 위 pill로 조절한다. 효과음은 `.ogg`와 `.m4a`(Safari용)로 제공하며, `afconvert -f m4af -d aac -b 96000 in.ogg out.m4a`로 변환했다. 출처와 라이선스는 `public/sfx/CREDITS.txt`에 있다.

## 봇

`src/games/yutnori/game/bot.ts`에는 상황별 규칙이 없다. 자기 차례가 되면 남은 결과를 쓰는 모든 순서를 `applyAction`으로 끝까지 진행해 보고, 그 결과 판을 점수화한다. 기준은 각 말이 완주하기까지의 기대 던지기 횟수(판 그래프에 대해 value iteration으로 한 번 계산), 다음 턴에 잡힐 확률, 상대 말을 잡을 확률이다. 난이도별 차이는 무작위 합법 수를 두는 빈도와 잡기 확률의 가중치다. `npm test`에서 어려움이 무작위 플레이와 쉬움 난이도를 이기는지 확인한다.

`src/games/omok/game/bot.ts`는 돌 주변 빈칸마다 내가 두면 생기는 모양과 상대가 두면 생기는 모양(오목, 4, 열린 3)을 `analyze`로 보고, 결정적인 수(오목, 막기, 열린 4, 4-3)를 먼저 고른다. 나머지는 5칸 창 점수로 비교한다. 어려움은 상위 후보마다 상대의 좋은 응수를 두어 보고 가장 나쁜 경우가 가장 나은 수를 고른다. 렌주 금수 판정은 삼삼의 3을 이루는 빈칸이 다시 금수인지까지는 따지지 않는다.

포격전 상태에는 포탄 궤적을 저장하지 않는다. 보는 쪽이 발사 직전 상태에서 `shotFlights`로 같은 비행을 다시 계산해 재생한다. 그래서 `world.ts`의 비행 계산은 사칙연산과 `Math.sqrt`만 쓴다(`Math.sin`·`cos`·`hypot`은 엔진마다 마지막 자리가 다를 수 있다). 지형은 36진수 문자열로 줄여 저장하며, 한 판 상태는 4KB 안팎이다(DB 규칙의 게임 문자열 한도는 20000자).

`src/games/tank/game/bot.ts`는 양쪽 방향, 각도 6~86°, 파워 25~100을 촘촘히 훑으며 실제 규칙과 같은 `fly`로 포탄을 날려 보고, 적에게 준 피해에서 아군 피해를 뺀 값이 가장 큰 조합을 고른다(바람과 지형이 그대로 반영된다). 그 조준으로 다른 무기가 더 나은지 보고, 아무도 맞힐 수 없으면 굴착탄을 쓴다. 난이도는 고른 각도·파워에 섞는 오차 크기다. 움직이지는 않는다.

`src/games/yutnori/components/Solo.tsx`는 게임을 React state로 돌리고, `useRoom`이 제공하는 것과 같은 형태의 `GameApi`를 `GameView`에 넘긴다. 진행 중인 게임은 `sessionStorage`(`yutnori:solo`)에 보관하므로 새로고침해도 사라지지 않는다.

## 비밀번호 게이트

`scripts/vite-plugin-password-gate.ts`가 단일 JS 번들을 AES-GCM으로 암호화한다(키는 PBKDF2-SHA256, 60만 회 반복으로 생성). `dist/`에는 암호문과, 비밀번호를 입력받아 브라우저에서 복호화하는 작은 로더만 들어 있다. 비밀번호가 틀리면 알림을 띄우고 탭을 닫는다(브라우저는 스크립트가 직접 연 창만 닫게 허용하므로 닫히지 않으면 화면을 비운다). 비밀번호는 탭 단위로 `sessionStorage`에 기억되어 새로고침 시 다시 묻지 않는다.

한계:

- 게이트는 페이지를 보호하고, `DB_KEY`를 통해 DB도 보호한다. 방은 `/miniparty/{DB_KEY}/rooms` 아래에 있고 규칙은 그 경로만 연다. 다만 번들을 복호화할 수 있는 사람(즉 비밀번호를 아는 사람)은 여전히 번들에서 키를 꺼내 어떤 방에든 쓸 수 있다.
- 암호문이 공개되어 있으므로 짧은 비밀번호는 오프라인 무차별 대입으로 뚫릴 수 있다. 긴 비밀번호를 쓴다.

## DB 규칙

방은 게임과 관계없이 `/miniparty/{DB_KEY}/rooms/{CODE}`에 있고, `gameType`으로 어느 게임 방인지 구분한다. 규칙은 경로 세그먼트를 어떤 클라이언트도 읽을 수 없는 `/miniparty_key`와 비교하므로, 키가 없으면 `/miniparty` 아래는 읽을 수도 쓸 수도 없다. 키는 번들에 포함되며 번들은 비밀번호 게이트가 암호화한다. sweeper는 서비스 계정을 쓰므로 규칙을 우회한다.

설정 순서(전환 중에도 운영 사이트가 계속 동작하도록 이 순서를 지킨다):

1. 키 생성: `openssl rand -hex 24`(`A-Z a-z 0-9 _ -`로 된 16~128자). super-yutnori에서 쓰던 키를 그대로 써도 된다.
2. repo 레벨 secret `DB_KEY`로 추가하고, 로컬 테스트용으로 `.env.local`에 `VITE_DB_KEY`로 넣는다.
3. Firebase console → Realtime Database → Data: 루트 자식 `miniparty_key`를 추가하고 키를 문자열 값으로 넣는다.
4. 아래 규칙을 기존 규칙 옆에 추가해 게시한다. super-yutnori가 아직 배포돼 있으면 `yutnori_key`, `yutnori` 항목은 그대로 둔다.

```json
"miniparty_key": { ".read": false, ".write": false },
"miniparty": {
  "$key": {
    "rooms": {
      ".indexOn": ["lastSeen"],
      "$code": {
        ".read": "$key === root.child('miniparty_key').val()",
        ".write": "$key === root.child('miniparty_key').val()",
        ".validate": "$code.matches(/^[A-Z0-9]{4}$/) && newData.hasChildren(['gameType', 'createdAt', 'hostId'])",
        "gameType": { ".validate": "newData.isString() && newData.val().length <= 20" },
        "players": {
          "$pid": {
            "name": { ".validate": "newData.isString() && newData.val().length >= 1 && newData.val().length <= 20" }
          }
        },
        "game": { ".validate": "!newData.exists() || (newData.isString() && newData.val().length < 20000)" }
      }
    }
  }
}
```

5. `main`에 푸시하고 배포가 끝날 때까지 기다린다.
6. super-yutnori를 내린 뒤 규칙에서 `yutnori_key`, `yutnori` 항목을 제거하고 `/yutnori` 데이터를 삭제한다.

이름은 UI에서 10자로 제한한다. 규칙에서 20자까지 허용하는 이유는 이모지 등 서로게이트 쌍이 거부되지 않게 하기 위해서이며, 과도하게 큰 쓰레기 데이터를 막는 용도일 뿐이다.

키 교체(예: 유출 시): `miniparty_key`와 `DB_KEY` secret을 바꾸고 다시 배포한다. 열려 있던 방은 사라진다.

## 구조

```
src/
  main.tsx, App.tsx     진입점, 최상위 라우트(메인 / 게임)
  router/               History API 라우터(usePath, navigate, Link)
  pages/HomePage/       메인화면: 게임 목록, 코드로 입장
  games/
    registry.ts         게임 목록. 메인화면과 라우트가 여기서 읽는다
    yutnori/
      YutnoriApp.tsx    /yut 아래 라우트(홈, bot, 방)
      room.ts           RoomGame 구현(공통 방 계층에 넣는 윷놀이 규칙)
      game/             판 그래프 + 순수 규칙 reducer + 봇 (테스트 있음)
      scene/            three.js 씬: 판, 말, 트레이, 윷가락
      components/       홈, 로비, 게임 HUD, 혼자하기
      styles/           윷놀이 SCSS(원래 단일 CSS를 순서대로 나눈 것)
    omok/
      OmokApp.tsx       /omok 아래 라우트(홈, bot, 방)
      room.ts           RoomGame 구현. 로비 자리(흑 / 백 / 관전)는 PlayerInfo.team 에 둔다
      game/             순수 규칙 reducer(렌주 금수 포함) + 봇 (테스트 있음)
      scene/            three.js 씬: 판, 돌, 돌통
      components/       홈, 로비, 게임 HUD, 혼자하기 (CSS Modules)
    tank/
      TankApp.tsx       /tank 아래 라우트(홈, bot, 방)
      room.ts           RoomGame 구현. 로비 자리(0~3 탱크, 4 관전)는 PlayerInfo.team 에 둔다
      game/             월드(열마다 흙 구간 목록인 지형·이동·포탄 비행), 맵 생성(maps.ts), 순수 규칙 reducer, 봇 (테스트 있음)
      scene/            2D 캔버스 전장: 발사 재생, 카메라, 지형 그리기(썸네일과 공유)
      components/       홈, 로비, 게임 HUD·조작판, 혼자하기 (CSS Modules)
  net/                  공통 통신: Firebase / 로컬 백엔드, useRoom, RoomGame
  components/           공통 UI(VolumeControl)
  games/*/assets/       게임 커버 사진. 출처는 같은 폴더 CREDITS.txt 와 registry 의 credit(메인화면 아래에 표시)
  audio/                효과음
  styles/               전역 SCSS: abstracts(변수·mixin), base, components
  utils/                storage 등
scripts/                빌드 시점 비밀번호 게이트 플러그인, 방 정리 sweeper
```

스타일은 SCSS만 쓴다(Tailwind 금지). 새 컴포넌트는 옆에 `Component.module.scss`를 두는 CSS Modules로 쓴다. 윷놀이 스타일은 아직 전역 클래스다. 같은 선택자가 여러 파일에 걸쳐 있어 `styles/index.scss`의 `@use` 순서를 바꾸면 cascade가 달라지고, 비밀번호 게이트 로더도 `.home-card`, `.title`, `.field`를 쓴다. 미디어 쿼리는 `@/styles/abstracts`의 `mobile`, `narrow`(폭), `short`(높이, 가로로 눕힌 휴대폰) mixin으로 쓴다.

## 게임 추가

1. `src/games/<id>/`에 규칙과 화면을 만든다.
2. 멀티플레이면 `RoomGame`(`src/net/game.ts`)을 구현하고 `useRoom(code, name, game)`을 쓴다. 게임 상태는 JSON으로 직렬화되고, `applyAction`은 transaction이 재시도하며 여러 번 부르므로 순수 함수여야 한다.
3. 방은 `openRoom(game.id, settings)`로 만든다. `gameType`이 들어가므로 메인화면의 코드 입장이 자동으로 이 게임으로 보낸다.
4. `src/games/registry.ts`에 `App`과 함께 등록한다. `App`이 없으면 메인화면에 "준비 중"으로만 보인다.
