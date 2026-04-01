# Ghostwork 👻

AI 에이전트 오케스트레이션 플랫폼 — 에이전트들로 구성된 팀이 자율적으로 작업을 수행합니다.

## 특징

- **에이전트 팀** — PM, Engineer, QA, Designer 역할의 AI 에이전트 팀 구성
- **하트비트 실행** — 에이전트가 주기적으로 깨어나서 이슈를 처리하고 잠듦
- **PM 오케스트레이션** — PM이 작업을 분석하고 서브태스크를 자동 생성/분배
- **Developer ↔ QA 협업** — 개발 완료 → QA 자동 리뷰 → 승인/거절 루프
- **6종 어댑터** — Claude, Codex, Gemini, OpenClaw Gateway, HTTP, Process
- **실시간 모니터링** — WebSocket 기반 실시간 로그 스트리밍
- **거버넌스** — 예산 관리, 승인 워크플로우, 시크릿 암호화

## 빠른 시작

```bash
# 설치
pnpm install

# 개발 서버 시작
pnpm build
GHOSTWORK_HOST=0.0.0.0 GHOSTWORK_MIGRATION_AUTO_APPLY=true node server/dist/index.js

# UI 개발 서버
cd ui && npx vite --host 0.0.0.0
```

서버: http://localhost:3100
UI: http://localhost:5173

## 프로젝트 구조

```
packages/
  db/          — Drizzle ORM + PostgreSQL 스키마
  shared/      — 공유 타입/유틸
  adapters/    — 에이전트 어댑터 (Claude, Codex, Gemini 등)
server/        — Fastify API 서버
ui/            — React SPA (Vite + Tailwind)
cli/           — CLI 도구
skills/        — 역할별 에이전트 스킬
docs/          — API 문서, 배포 가이드
```

## 기술 스택

- **서버:** Fastify 5 + Drizzle ORM + PostgreSQL
- **UI:** React 19 + Vite 6 + Tailwind CSS v4 + TanStack Query
- **테스트:** Vitest
- **인증:** scrypt + Agent JWT + AES-256-GCM
- **실시간:** WebSocket (EventEmitter pub/sub)

## 환경변수

`.env.example` 참고

## 라이선스

MIT
