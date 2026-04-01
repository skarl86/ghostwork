# Blueprint: Work Products & Execution Workspace System

## 목적

이슈 작업 시 생성되는 PR, 브랜치, preview URL 등 산출물을 명시적으로 추적하여
QA reject → 개발자 재작업 → QA 재리뷰 워크플로우를 완전하게 만든다.

## 참고: Paperclip 원본 구조

### 1. execution_workspaces 테이블 (이미 일부 존재)

현재 우리 `execution_workspaces` 테이블에 없는 필드를 추가해야 한다.
Paperclip 원본 필드:

```
id, companyId, projectId, projectWorkspaceId, sourceIssueId,
mode, strategyType, name, status, cwd, repoUrl,
baseRef, branchName,     ← 이것들이 핵심
providerType, providerRef, derivedFromExecutionWorkspaceId,
lastUsedAt, openedAt, closedAt, cleanupEligibleAt, cleanupReason,
metadata, createdAt, updatedAt
```

현재 우리 `execution_workspaces`에는 `baseRef`, `branchName`, `sourceIssueId`,
`mode`, `strategyType`, `providerType`, `providerRef` 등이 없다.

### 2. issue_work_products 테이블 (새로 추가)

이슈에 연결된 작업 산출물 (PR, branch, preview 등):

```sql
CREATE TABLE issue_work_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  issue_id UUID NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  execution_workspace_id UUID REFERENCES execution_workspaces(id) ON DELETE SET NULL,
  type TEXT NOT NULL,           -- 'pull_request' | 'branch' | 'preview' | 'deployment'
  provider TEXT NOT NULL,       -- 'github' | 'gitlab' | 'local'
  external_id TEXT,             -- PR number 등
  title TEXT NOT NULL,
  url TEXT,                     -- PR URL, preview URL 등
  status TEXT NOT NULL,         -- 'open' | 'merged' | 'closed' | 'draft'
  review_state TEXT NOT NULL DEFAULT 'none',  -- 'none' | 'approved' | 'changes_requested'
  is_primary BOOLEAN NOT NULL DEFAULT false,
  health_status TEXT NOT NULL DEFAULT 'unknown',
  summary TEXT,
  metadata JSONB,
  created_by_run_id UUID REFERENCES heartbeat_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 3. QA Reject → 재작업 워크플로우

**현재 (문제):**
```
developer 완료 → in_review → QA reject → todo
→ developer 재작업 시 새 세션, 이전 PR/branch 정보 없음
```

**수정 후:**
```
developer 완료 → in_review
  → PR 생성 시 work_product 등록 (type=pull_request, status=open)
  → QA reject
    → issue status → todo
    → work_product.review_state → 'changes_requested'
    → PR은 열어둠 (close 안 함)
  → developer 재작업
    → 프롬프트에 QA 피드백 + PR URL + "기존 브랜치에서 수정" 지시
    → 같은 branch에 commit & push
    → work_product.review_state → 'none' (재리뷰 대기)
  → QA 재리뷰
    → approved → status: done, work_product.review_state → 'approved'
    → rejected → 위 사이클 반복
```

## 구현 범위

### Phase 1: DB 스키마

1. `issue_work_products` 테이블 생성 (Drizzle schema + migration)
2. `execution_workspaces` 테이블에 누락 필드 추가 (sourceIssueId, baseRef, branchName 등)
   - 현재 테이블 구조를 확인하고 누락된 것만 추가

### Phase 2: 서비스 레이어

1. `workProductService` — CRUD + listForIssue + update reviewState
2. `executionWorkspaceService` 확장 — branch/baseRef 관리

### Phase 3: API 라우트

1. `GET /api/issues/:id/work-products` — 이슈의 산출물 목록
2. `POST /api/issues/:id/work-products` — 산출물 등록
3. `PATCH /api/work-products/:id` — 산출물 업데이트
4. `DELETE /api/work-products/:id` — 산출물 삭제

### Phase 4: 실행 엔진 통합

1. **개발자 실행 완료 시:**
   - summary에서 PR URL 파싱 → work_product 자동 등록
   - branch 이름 추출 → execution_workspace에 저장

2. **QA reject 시:**
   - work_product.review_state → 'changes_requested'
   - PR은 close 하지 않음

3. **개발자 재작업 프롬프트:**
   - 이전 QA 피드백 포함 (이미 있음)
   - PR URL + branch 정보 추가
   - "기존 브랜치에서 수정하라" 지시 추가

4. **QA approve 시:**
   - work_product.review_state → 'approved'
   - work_product.status → 'merged' (optional: gh pr merge)

### Phase 5: UI

1. 이슈 상세 페이지에 Work Products 섹션 추가
2. PR 링크, 상태, 리뷰 상태 표시

## 제약사항

- 기존 테스트 깨지면 안 됨
- 기존 워크플로우 backward compatible
- PR 생성/머지는 에이전트(Claude Code)가 gh CLI로 직접 수행 — 서버는 추적만
- 빌드 + 린트 + 테스트 전부 통과해야 함

## 파일 참조 (Paperclip 원본)

- `paperclip/packages/db/src/schema/issue_work_products.ts`
- `paperclip/packages/db/src/schema/execution_workspaces.ts`
- `paperclip/server/src/services/work-products.ts`
- `paperclip/server/src/services/execution-workspaces.ts`
- `paperclip/server/src/routes/issues.ts` (work-products 라우트 부분)
