# mini-party 프로젝트 규칙

전역 CLAUDE.md 를 따르되, 아래 항목은 이 프로젝트에서 전역 규칙보다 우선한다.

## Git

- 별도 브랜치를 만들지 않는다. `main` 에서 바로 커밋하고 `main` 으로 푸시한다.
  - 전역 규칙의 브랜치 접두사(1장), PR 절차(3장), `main` 직접 푸시 금지(4장)는 이 프로젝트에 적용하지 않는다.
- 커밋 타입·메시지 형식·커밋 단위(2장)는 전역 규칙을 그대로 따른다. `Co-Authored-By` 는 넣지 않는다.
- `main` 푸시는 곧 배포다(`.github/workflows/deploy.yml` → `https://hdomi.github.io/mini-party/`). 푸시 전에 `npm run typecheck`, `npm test`, `npm run build` 를 통과시킨다.
- force push 금지, 되돌릴 땐 `git revert`(전역 5장).

## 스택

- React + Vite + TypeScript. 프레임워크를 바꾸지 않는다.
- 스타일은 SCSS 만 쓴다. **Tailwind 는 절대 쓰지 않는다.**
  - 새 컴포넌트는 옆에 `Component.module.scss` 를 두는 CSS Modules 로 쓴다.
  - 공용 변수·mixin 은 `@use '@/styles/abstracts' as *;` 로 가져온다. 미디어 쿼리는 `mobile` / `narrow` mixin 으로 쓴다.
  - 윷놀이 스타일(`src/games/yutnori/styles/`)은 전역 클래스다. `index.scss` 의 `@use` 순서를 바꾸면 cascade 가 달라진다. 비밀번호 게이트 로더도 `.home-card`, `.title`, `.field` 를 쓴다.

## 코드

- import 는 `@/` alias 를 쓴다. 단 `src/net/paths.ts`, `sweep.ts`, `types.ts` 는 `scripts/sweep-rooms.ts` 가 node 로 직접 실행하므로 상대 경로만 쓴다.
- 멀티플레이 게임은 `RoomGame`(`src/net/game.ts`)을 구현하고 `useRoom` 을 쓴다. 게임 추가 절차는 README 의 "게임 추가" 참고.
- URL 에 `#` 을 쓰지 않는다(`src/router`). 라우트 이름은 `dist` 의 실제 폴더(`assets`, `sfx`)와 겹치면 안 된다.
- 비밀번호 게이트가 단일 JS 번들만 암호화하므로 code splitting(dynamic import, lazy)을 쓰지 않는다.
- 외부 이미지는 라이선스를 확인한 것만 쓴다(CC0, 퍼블릭 도메인, CC BY/BY-SA 등). 저작자 표시가 필요하면 같은 폴더 `CREDITS.txt` 와 `registry.ts` 의 `credit` 에 적는다. 메인화면 아래에 표시된다.
- 주석·문서·UI 문구는 한국어로 쓴다.
