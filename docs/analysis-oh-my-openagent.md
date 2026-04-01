# oh-my-openagent (OmO) 하네스 엔지니어링 분석

## 1. 핵심 아키텍처: 3계층 분리

```
Planning Layer (인간 + Prometheus)
  └→ 계획 수립, 인터뷰, 갭 분석
  
Execution Layer (Atlas/Orchestrator)
  └→ 계획 실행, 태스크 분배, 결과 검증
  
Worker Layer (전문 에이전트들)
  └→ 실제 코드 작성, 리서치, 리뷰
```

### 핵심 원칙: "계획과 실행의 완전한 분리"

- **Prometheus(Planner)**는 절대 코드를 작성하지 않음
- **Atlas(Orchestrator)**는 절대 직접 코드를 수정하지 않음 — 위임만 함
- **Worker**는 자기 태스크만 실행 — 다른 태스크에 접근 불가

## 2. Prometheus (Planner) 상세 분석

### 2.1 인터뷰 모드 — 핵심 혁신

Prometheus는 바로 계획을 세우지 않는다. **먼저 인터뷰**한다.

**Intent Classification (의도 분류):**

| 의도 | 인터뷰 전략 | 깊이 |
|------|------------|------|
| Trivial/Simple | 빠른 확인 → 바로 제안 | 1-2 질문 |
| Refactoring | 안전성 중심 — 현재 동작, 테스트 커버리지, 롤백 전략 | 심층 |
| Build from Scratch | 발견 중심 — 기존 패턴 탐색 → 요구사항 확인 | 심층 |
| Mid-sized Task | 경계 중심 — 정확한 산출물, 명시적 제외 | 중간 |
| Architecture | 전략 중심 — 장기 영향, 트레이드오프 | 최심층 |

**핵심:** 의도에 따라 인터뷰 깊이와 전략이 달라진다.

### 2.2 리서치 에이전트 활용

인터뷰 중 자동으로 하위 에이전트에게 리서치를 위임:

```
explore → 코드베이스 탐색 (기존 패턴, 의존성, 구조)
librarian → 외부 문서/라이브러리 검색
oracle → 아키텍처 자문 (고위험 결정 시)
```

**중요:** 사용자에게 질문하기 **전에** 리서치를 먼저 돌린다.
→ "이런 패턴을 발견했는데, 이대로 갈까요?" 식으로 근거 기반 질문

### 2.3 계획 생성 프로세스

```
인터뷰 완료
  → Metis (Gap Analyzer)에게 검토 요청
    → "놓친 질문, 숨은 의도, 범위 확장 위험, 누락된 수락 기준" 분석
  → 계획 자동 생성
  → 자기 검증 (Self-Review)
    → CRITICAL (사용자 결정 필요) / MINOR (자동 해결) / AMBIGUOUS (기본값 적용)
  → 사용자에게 요약 제시
  → (선택) Momus (Reviewer)가 고정밀도 검증
    → OKAY / REJECT 루프
```

### 2.4 계획 템플릿 구조 — 이것이 하위 에이전트 성공의 핵심

```markdown
# {Plan Title}

## TL;DR (1-2문장 + 산출물 목록 + 노력도 + 병렬 실행 가능 여부)

## Context (원래 요청 + 인터뷰 요약 + 리서치 결과 + Metis 리뷰)

## Work Objectives
- Core Objective
- Concrete Deliverables (정확한 파일/엔드포인트/UI)
- Definition of Done (검증 명령어 포함)
- Must Have / Must NOT Have (가드레일)

## Verification Strategy (자동 검증만 — 사람 개입 불가)

## Execution Strategy
- Parallel Execution Waves (독립 태스크 그룹핑)
- Dependency Matrix
- Agent Dispatch Summary (태스크별 카테고리/모델 매핑)

## TODOs (각 태스크마다):
- What to do (구현 단계)
- Must NOT do (제외 사항)
- Recommended Agent Profile (카테고리 + 스킬 + 이유)
- References (패턴, API, 테스트, 외부 — 각각 "왜 필요한지" 설명)
- Acceptance Criteria (에이전트가 실행 가능한 검증만)
- QA Scenarios (구체적 셀렉터, 데이터, 기대값)
- Commit Strategy

## Final Verification Wave (4개 병렬 리뷰)
- F1: Plan Compliance Audit
- F2: Code Quality Review  
- F3: Real Manual QA
- F4: Scope Fidelity Check
```

## 3. 카테고리 시스템 — 모델 라우팅의 핵심

에이전트가 모델을 직접 지정하지 않고 **카테고리**를 지정:

| 카테고리 | 모델 | 용도 |
|---------|------|------|
| visual-engineering | Gemini 3.1 Pro | 프론트엔드, UI/UX |
| ultrabrain | GPT-5.4 (xhigh) | 깊은 논리, 아키텍처 |
| deep | GPT-5.3 Codex | 자율적 문제 해결 |
| quick | GPT-5.4 Mini | 사소한 변경 |
| writing | Gemini 3 Flash | 문서, 산문 |

**왜 카테고리인가:**
- 모델 이름 → 자기 인식 편향 발생
- 카테고리 → 의도(intent) 기반 라우팅, 모델 교체 시 코드 변경 불필요

## 4. Wisdom Accumulation (지혜 축적)

Atlas가 태스크 완료 후 학습 내용을 추출하여 이후 태스크에 전달:

```
.sisyphus/notepads/{plan-name}/
├── learnings.md      # 패턴, 컨벤션, 성공한 접근법
├── decisions.md      # 아키텍처 선택과 근거
├── issues.md         # 문제점, 블로커, 함정
├── verification.md   # 테스트 결과, 검증 결과
└── problems.md       # 미해결 이슈, 기술 부채
```

**효과:** Worker N이 발견한 함정을 Worker N+1이 반복하지 않음

## 5. Todo Enforcer (시스펄스 메커니즘)

Worker가 중간에 멈추면 시스템이 강제로 다시 밀어넣음:

```
[SYSTEM REMINDER - TODO CONTINUATION]
You have incomplete todos! Complete ALL before responding:
- [ ] Implement user service ← IN PROGRESS
- [ ] Add validation
- [ ] Write tests
DO NOT respond until all todos are marked completed.
```

---

# Ghostwork 적용 방안

## A. PM 에이전트 (샬롯) → Prometheus 패턴 적용

### 현재 문제
- 이슈를 받으면 바로 서브이슈로 분할 → 깊은 분석 없이 분배
- 서브이슈 설명이 모호 → 하위 에이전트가 맥락 부족으로 실패

### 적용할 것

**1. 인터뷰 + 리서치 우선 원칙**

PM이 이슈를 받으면:
```
1. Intent Classification — 이 이슈가 trivial/refactor/build/architecture 중 뭔지 판단
2. Codebase Research — 관련 파일 탐색, 기존 패턴 확인
3. Plan Generation — 구체적인 실행 계획 수립
```

**2. 서브이슈 템플릿 강화**

각 서브이슈에 반드시 포함:
```
- What to do: 구체적 구현 단계
- Must NOT do: 명시적 제외
- References: 참조할 파일과 그 이유
- Acceptance Criteria: 에이전트가 직접 검증 가능한 기준
- Verification Commands: pnpm build && pnpm lint && pnpm test:unit
```

**3. Gap Analysis (Metis 역할)**

PM이 계획 세운 후 자기 검증:
- 빠진 요구사항 없는지
- 범위가 명확한지
- 가드레일이 설정됐는지

## B. Developer 에이전트 (카카) → Sisyphus-Junior 패턴

### 적용할 것

**1. Focused Execution**
- PM이 내린 태스크만 실행
- 범위 밖 작업 금지
- 이전 태스크의 learnings 참고

**2. Self-Verification Gate (이미 적용됨)**
- build + lint + test 통과 필수

**3. Todo Tracking**
- 작업 시작 시 TODO 목록 생성
- 완료 시까지 하나씩 체크

## C. QA 에이전트 (꼼꼼이) → Momus + Final Verification 패턴

### 적용할 것

**1. 다층 검증**
```
1. 자동 검증: build + lint + test
2. 코드 리뷰: 실제 구현이 요구사항에 맞는지
3. 범위 검증: 요청한 것만 수정했는지 (scope fidelity)
4. 테스트 품질: 테스트가 실제 구현을 검증하는지
```

## D. 카테고리 시스템 → Ghostwork 어댑터 라우팅

현재: 에이전트마다 고정 어댑터 (claude-local)
변경: PM이 태스크별 카테고리 지정 → 카테고리가 적절한 모델로 라우팅

```
PM (Opus 4.6) → 복잡한 판단, 계획 수립
Engineer 일반 (Sonnet 4.6) → 구현
Engineer 고난도 (Opus 4.6) → 아키텍처 수준 구현
QA (Sonnet 4.6) → 리뷰
Quick fix (Haiku) → 사소한 수정
```

## E. Wisdom Accumulation → completionReport 확장

현재: 이슈 완료 시 summary만 저장
변경: learnings, decisions, issues, gotchas 구조화 저장
→ 다음 이슈에서 PM이 참고할 수 있게

---

# 우선순위 구현 로드맵

| 순서 | 항목 | 난이도 | 효과 |
|------|------|--------|------|
| **1** | PM 스킬 강화 (인터뷰 + 리서치 + 구체적 서브이슈 템플릿) | 중 | **최고** |
| **2** | 서브이슈 템플릿 강제 (References + Acceptance Criteria) | 낮 | 높 |
| **3** | QA 다층 검증 (코드 리뷰 + 범위 검증) | 중 | 높 |
| **4** | 카테고리 기반 모델 라우팅 | 중 | 중 |
| **5** | Wisdom Accumulation (learnings 구조화) | 중 | 중 |
| **6** | Todo Enforcer (Worker 중단 방지) | 낮 | 중 |
