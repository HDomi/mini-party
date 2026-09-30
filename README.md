# super-yutnori

친구들과 함께하는 3D 멀티플레이 윷놀이. React + react-three-fiber로 만들고, Firebase Realtime Database로 동기화하며, GitHub Pages에서 호스팅한다.

- 2~6명, 개인전 또는 팀전(2~3팀), 팀당 말 2~5개
- 방 코드 + 공유 링크(`/#/ABCD`), 재접속해도 유지되는 자리, 관전자
- 봇과 1:1(`/#/bot`, 쉬움 / 보통 / 어려움). 탭 안에서만 진행되며 DB 트래픽이 없다
- 번들 전체를 빌드 시점에 비밀번호로 암호화한다

## 개발

```sh
npm install
npm run dev     # http://localhost:5173
npm test        # 규칙 테스트
```

`VITE_FIREBASE_DATABASE_URL`이 없으면 로컬 백엔드를 쓴다. 같은 브라우저에서 탭을 여러 개 열면 탭마다 별도 플레이어가 된다.

실제 DB로 테스트하려면 `.env.local`을 만든다.

```
VITE_FIREBASE_DATABASE_URL=https://<instance>.firebaseio.com
VITE_DB_KEY=<DB의 /yutnori_key 와 같은 값>
```

## 배포

`main`에 푸시하면 `.github/workflows/deploy.yml`이 실행되어 `https://hdomi.github.io/super-yutnori/`에 배포된다.

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

`src/ui/sound.ts`가 Web Audio로 효과음을 재생한다(배경 음악은 연결만 해 두고 지금은 주석 처리). 볼륨은 0에서 시작하며 `localStorage`(`yutnori:volume`)에 저장되고, 오른쪽 위 pill로 조절한다. 효과음은 `.ogg`와 `.m4a`(Safari용)로 제공하며, `afconvert -f m4af -d aac -b 96000 in.ogg out.m4a`로 변환했다. 출처와 라이선스는 `public/sfx/CREDITS.txt`에 있다.

## 봇

`src/game/bot.ts`에는 상황별 규칙이 없다. 자기 차례가 되면 남은 결과를 쓰는 모든 순서를 `applyAction`으로 끝까지 진행해 보고, 그 결과 판을 점수화한다. 기준은 각 말이 완주하기까지의 기대 던지기 횟수(판 그래프에 대해 value iteration으로 한 번 계산), 다음 턴에 잡힐 확률, 상대 말을 잡을 확률이다. 난이도별 차이는 무작위 합법 수를 두는 빈도와 잡기 확률의 가중치다. `npm test`에서 어려움이 무작위 플레이와 쉬움 난이도를 이기는지 확인한다.

`src/ui/Solo.tsx`는 게임을 React state로 돌리고, `useRoom`이 제공하는 것과 같은 형태의 `GameApi`를 `GameView`에 넘긴다. 진행 중인 게임은 `sessionStorage`(`yutnori:solo`)에 보관하므로 새로고침해도 사라지지 않는다.

## 비밀번호 게이트

`scripts/vite-plugin-password-gate.ts`가 단일 JS 번들을 AES-GCM으로 암호화한다(키는 PBKDF2-SHA256, 60만 회 반복으로 생성). `dist/`에는 암호문과, 비밀번호를 입력받아 브라우저에서 복호화하는 작은 로더만 들어 있다. 비밀번호가 틀리면 알림을 띄우고 탭을 닫는다(브라우저는 스크립트가 직접 연 창만 닫게 허용하므로 닫히지 않으면 화면을 비운다). 비밀번호는 탭 단위로 `sessionStorage`에 기억되어 새로고침 시 다시 묻지 않는다.

한계:

- 게이트는 페이지를 보호하고, `DB_KEY`를 통해 DB도 보호한다. 방은 `/yutnori/{DB_KEY}/rooms` 아래에 있고 규칙은 그 경로만 연다. 다만 번들을 복호화할 수 있는 사람(즉 비밀번호를 아는 사람)은 여전히 번들에서 키를 꺼내 어떤 방에든 쓸 수 있다.
- 암호문이 공개되어 있으므로 짧은 비밀번호는 오프라인 무차별 대입으로 뚫릴 수 있다. 긴 비밀번호를 쓴다.

## DB 규칙

방은 `/yutnori/{DB_KEY}/rooms/{CODE}`에 있다. 규칙은 경로 세그먼트를 어떤 클라이언트도 읽을 수 없는 `/yutnori_key`와 비교하므로, 키가 없으면 `/yutnori` 아래는 읽을 수도 쓸 수도 없다. 키는 번들에 포함되며 번들은 비밀번호 게이트가 암호화한다. sweeper는 서비스 계정을 쓰므로 규칙을 우회한다.

설정 순서(전환 중에도 운영 사이트가 계속 동작하도록 이 순서를 지킨다):

1. 키 생성: `openssl rand -hex 24`(`A-Z a-z 0-9 _ -`로 된 16~128자).
2. repo 레벨 secret `DB_KEY`로 추가하고, 로컬 테스트용으로 `.env.local`에 `VITE_DB_KEY`로 넣는다.
3. Firebase console → Realtime Database → Data: 루트 자식 `yutnori_key`를 추가하고 키를 문자열 값으로 넣는다.
4. 아래 규칙을 게시한다. 현재 배포된 빌드가 계속 동작하도록 당분간 기존 `"rooms": { ... }` 항목을 `"yutnori"` 안의 `"$key"` 옆에 남겨 둔다(이름이 지정된 자식이 와일드카드보다 우선한다). 다른 경로는 그대로 둔다.

```json
"yutnori_key": { ".read": false, ".write": false },
"yutnori": {
  "$key": {
    "rooms": {
      ".indexOn": ["lastSeen"],
      "$code": {
        ".read": "$key === root.child('yutnori_key').val()",
        ".write": "$key === root.child('yutnori_key').val()",
        ".validate": "$code.matches(/^[A-Z0-9]{4}$/) && newData.hasChildren(['createdAt', 'hostId'])",
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
6. 규칙에서 기존 `rooms` 항목을 제거하고 `/yutnori/rooms` 데이터를 삭제한다. 더 이상 이 데이터를 읽는 곳이 없고 sweeper도 여기를 보지 않는다.

이름은 UI에서 10자로 제한한다. 규칙에서 20자까지 허용하는 이유는 이모지 등 서로게이트 쌍이 거부되지 않게 하기 위해서이며, 과도하게 큰 쓰레기 데이터를 막는 용도일 뿐이다.

키 교체(예: 유출 시): `yutnori_key`와 `DB_KEY` secret을 바꾸고 다시 배포한다. 열려 있던 방은 사라진다.

## 구조

```
src/game/    판 그래프 + 순수 규칙 reducer (테스트 있음)
src/net/     Firebase / 로컬 백엔드, 방 hook
src/scene/   three.js 씬: 판, 말, 트레이, 윷가락
src/ui/      홈, 로비, 게임 HUD, 폭죽
scripts/     빌드 시점 비밀번호 게이트 플러그인
```
