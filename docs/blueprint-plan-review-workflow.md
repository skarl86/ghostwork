# Blueprint: Plan Review Workflow (draft → plan_review → todo)

## 목적

PM이 서브이슈를 생성하면, 개발자에게 할당되기 전에 Plan Reviewer가
서브이슈의 실행가능성을 검증하는 워크플로우를 추가한다.

## 변경 범위

### 1. 이슈 상태 추가: `plan_review`

현재 상태: backlog, todo, in_progress, in_review, done, closed, cancelled
추가 상태: `plan_review` (PM이 생성한 서브이슈가 Plan Reviewer 대기 중)

파일: `server/src/routes/issues.ts`
- ISSUE_STATUSES에 'plan_review' 추가

### 2. 새 Role: `plan-reviewer`

파일: `server/src/heartbeat/execute.ts`

```typescript
// 추가
const PLAN_REVIEW_ROLES = new Set(['plan-reviewer']);

// getSkillDirsForRole에 추가
case 'plan-reviewer':
  return [base, resolve(PROJECT_ROOT, 'skills', 'plan-reviewer')];
```

### 3. PM 워크플로우 변경

현재:
- PM이 서브이슈를 status='todo'로 생성

변경:
- PM이 서브이슈를 status='plan_review'로 생성
- Plan Reviewer가 리뷰 → APPROVED → status='todo'
- Plan Reviewer가 리뷰 → REJECTED → status='backlog' (PM에게 돌아감)

파일: `server/src/heartbeat/execute.ts` — PM 완료 처리 부분

현재 PM 코드 (약 line 900 부근):
```typescript
} else if (role === 'pm') {
  // PM 이슈 완료 처리...
  // 서브이슈를 todo로 생성
}
```

변경:
- PM이 서브이슈 생성 시 status='plan_review'로 설정
- (PM이 직접 API 호출하는 것이 아니라, PM의 summary를 파싱하여 서브이슈를 만드는 로직에서 변경)

### 4. 스케줄러: Plan Reviewer가 plan_review 이슈를 체크아웃

현재 스케줄러는 status='todo'인 이슈를 개발자에게 할당한다.
Plan Reviewer는 status='plan_review'인 이슈를 체크아웃해야 한다.

파일: `server/src/heartbeat/scheduler.ts` 또는 `execute.ts`의 이슈 할당 로직

변경:
- Plan Reviewer role의 에이전트는 plan_review 상태의 이슈를 체크아웃
- 다른 role의 에이전트는 기존대로 todo/backlog 이슈를 체크아웃

### 5. Plan Reviewer 실행 완료 처리

파일: `server/src/heartbeat/execute.ts` — 실행 완료 분기

QA_ROLES 처리와 유사하게:

```typescript
} else if (PLAN_REVIEW_ROLES.has(role)) {
  // Plan Reviewer 완료 처리
  const isRejected = REJECTION_PATTERNS.some(p => p.test(summary));
  const isApproved = !isRejected && APPROVAL_PATTERNS.some(p => p.test(summary));

  if (isApproved) {
    // plan_review → todo (개발자가 체크아웃 가능)
    await db.update(issues)
      .set({ status: 'todo', updatedAt: new Date() })
      .where(eq(issues.id, issueData.id));
    // activity log
  } else {
    // plan_review → backlog (PM에게 돌아감)
    await db.update(issues)
      .set({ status: 'backlog', updatedAt: new Date() })
      .where(eq(issues.id, issueData.id));
    // activity log: plan_review.rejected
    // PM이 backlog 이슈를 다시 볼 때 rejection 피드백을 볼 수 있도록
    // 이전 run summary를 저장
  }
}
```

### 6. Plan Reviewer 프롬프트 빌드

파일: `server/src/heartbeat/execute.ts`

Plan Reviewer가 실행될 때 프롬프트에 서브이슈의 제목+설명을 전달:

```typescript
function buildPlanReviewPrompt(issue: { title: string; description: string | null }): string {
  return [
    '# Plan Review Request',
    '',
    `## Sub-Issue Title: ${issue.title}`,
    '',
    '## Sub-Issue Description:',
    issue.description || '(No description)',
    '',
    'Review this sub-issue for executability.',
    'Check: references exist, task is clear, acceptance criteria are verifiable.',
    'Respond with APPROVED or REJECTED: <reason>',
  ].join('\n');
}
```

### 7. 이슈 체크아웃 로직 변경

파일: `server/src/heartbeat/checkout.ts` (또는 scheduler에서 이슈 찾는 로직)

현재: 에이전트가 이슈를 체크아웃할 때 todo/backlog 상태만 대상
변경: plan-reviewer role은 plan_review 상태만 대상

### 8. UI 변경 (선택)

이슈 상태에 plan_review가 추가되면 UI의 칸반 보드나 상태 표시에도 반영 필요.
최소한 상태 배지 색상/라벨 추가.

### 9. 테스트

- Plan Reviewer 완료 시 APPROVED → status todo 전환
- Plan Reviewer 완료 시 REJECTED → status backlog 전환
- PM 서브이슈 생성 시 status=plan_review
- Plan Reviewer가 plan_review 이슈만 체크아웃
- 기존 워크플로우 (QA, developer) 영향 없음

## 제약사항

- 기존 테스트 깨지면 안 됨
- plan_review 상태 없는 기존 이슈는 그대로 동작 (backward compatible)
- Plan Reviewer가 없는 회사는 PM이 바로 todo로 생성 (기존과 동일)
- 빌드 + 린트 + 테스트 전부 통과해야 함

## 에이전트 설정 참고

Plan Reviewer 에이전트를 만들 때:
- role: 'plan-reviewer'
- adapter: claude-local (또는 선호 어댑터)
- model: sonnet 4.6 (계획 리뷰에 opus 불필요)
