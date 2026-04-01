#!/usr/bin/env bash
# E2E lifecycle test against running server at localhost:3100
set -euo pipefail

BASE="http://localhost:3100/api"
PASS=0
FAIL=0

ok()   { PASS=$((PASS+1)); echo "  ✅ $1"; }
fail() { FAIL=$((FAIL+1)); echo "  ❌ $1: $2"; }

check_status() {
  local label="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then ok "$label"; else fail "$label" "expected=$expected got=$actual"; fi
}

echo "═══════════════════════════════════════"
echo "  Ghostwork E2E Lifecycle Test"
echo "═══════════════════════════════════════"

# ── 1. Health ──
echo ""
echo "▸ Health"
STATUS=$(curl -sf "$BASE/health" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
check_status "GET /api/health" "ok" "$STATUS"

SCHED=$(curl -sf "$BASE/health" | python3 -c "import sys,json; print(json.load(sys.stdin)['scheduler'])")
check_status "Scheduler running" "running" "$SCHED"

# ── 2. Company CRUD ──
echo ""
echo "▸ Company CRUD"
COMPANY=$(curl -sf -X POST "$BASE/companies" -H 'Content-Type: application/json' \
  -d '{"name":"E2E Test Co","description":"Automated test"}')
CID=$(echo "$COMPANY" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$CID" ] && ok "Create company ($CID)" || fail "Create company" "no id"

CNAME=$(curl -sf "$BASE/companies/$CID" | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
check_status "Get company" "E2E Test Co" "$CNAME"

UNAME=$(curl -sf -X PATCH "$BASE/companies/$CID" -H 'Content-Type: application/json' \
  -d '{"name":"E2E Updated Co"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['name'])")
check_status "Update company" "E2E Updated Co" "$UNAME"

# ── 3. Agent CRUD (process adapter) ──
echo ""
echo "▸ Agent CRUD"
AGENT=$(curl -sf -X POST "$BASE/agents" -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$CID\",\"name\":\"Echo Bot\",\"role\":\"worker\",\"adapterType\":\"process\",\"adapterConfig\":{\"command\":\"echo\",\"args\":[\"task completed\"]},\"runtimeConfig\":{\"intervalSec\":9999,\"maxConcurrentRuns\":1}}")
AID=$(echo "$AGENT" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$AID" ] && ok "Create agent ($AID)" || fail "Create agent" "no id"

ATYPE=$(curl -sf "$BASE/agents/$AID" | python3 -c "import sys,json; print(json.load(sys.stdin)['adapterType'])")
check_status "Agent adapterType" "process" "$ATYPE"

# ── 4. Issue CRUD ──
echo ""
echo "▸ Issue CRUD"
ISSUE=$(curl -sf -X POST "$BASE/issues" -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$CID\",\"title\":\"E2E Test Issue\",\"priority\":\"high\",\"assigneeAgentId\":\"$AID\"}")
IID=$(echo "$ISSUE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$IID" ] && ok "Create issue ($IID)" || fail "Create issue" "no id"

ISTATUS=$(curl -sf "$BASE/issues/$IID" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
check_status "Issue initial status" "backlog" "$ISTATUS"

USTATUS=$(curl -sf -X PATCH "$BASE/issues/$IID" -H 'Content-Type: application/json' \
  -d '{"status":"open"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
check_status "Issue update status" "open" "$USTATUS"

# ── 5. Project CRUD ──
echo ""
echo "▸ Project CRUD"
PROJ=$(curl -sf -X POST "$BASE/projects" -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$CID\",\"name\":\"E2E Project\"}")
PID=$(echo "$PROJ" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$PID" ] && ok "Create project ($PID)" || fail "Create project" "no id"

# ── 6. Goal CRUD ──
echo ""
echo "▸ Goal CRUD"
GOAL=$(curl -sf -X POST "$BASE/goals" -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$CID\",\"title\":\"E2E Goal\",\"level\":\"company\"}")
GID=$(echo "$GOAL" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$GID" ] && ok "Create goal ($GID)" || fail "Create goal" "no id"

# ── 7. Manual Wakeup + Run Lifecycle ──
echo ""
echo "▸ Manual Wakeup + Run Lifecycle"
WAKEUP=$(curl -sf -X POST "$BASE/heartbeat/wakeup" -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$CID\",\"agentId\":\"$AID\",\"reason\":\"e2e-test\"}")
RID=$(echo "$WAKEUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['runId'])")
[ -n "$RID" ] && ok "Wakeup created run ($RID)" || fail "Wakeup" "no runId"

COAL=$(echo "$WAKEUP" | python3 -c "import sys,json; print(json.load(sys.stdin)['coalesced'])")
check_status "Not coalesced" "False" "$COAL"

# Wait for scheduler to pick up and execute (up to 30s)
echo "  ⏳ Waiting for run to complete..."
for i in $(seq 1 15); do
  sleep 2
  RSTATUS=$(curl -sf "$BASE/heartbeat/runs/$RID" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  if [ "$RSTATUS" = "succeeded" ] || [ "$RSTATUS" = "failed" ] || [ "$RSTATUS" = "timed_out" ]; then
    break
  fi
done

check_status "Run completed" "succeeded" "$RSTATUS"

# Check run details
SUMMARY=$(curl -sf "$BASE/heartbeat/runs/$RID" | python3 -c "import sys,json; r=json.load(sys.stdin); print(r.get('summary',''))")
echo "  📋 Run summary: $SUMMARY"

EXIT_CODE=$(curl -sf "$BASE/heartbeat/runs/$RID" | python3 -c "import sys,json; print(json.load(sys.stdin).get('exitCode',''))")
check_status "Exit code" "0" "$EXIT_CODE"

# ── 8. Issue Checkout/Release ──
echo ""
echo "▸ Issue Checkout/Release"
CHECKOUT=$(curl -sf -X POST "$BASE/issues/$IID/checkout" -H 'Content-Type: application/json' \
  -d "{\"agentId\":\"$AID\",\"runId\":\"$RID\"}")
CRID=$(echo "$CHECKOUT" | python3 -c "import sys,json; print(json.load(sys.stdin)['runId'])")
check_status "Checkout issue" "$RID" "$CRID"

RELEASE=$(curl -sf -X POST "$BASE/issues/$IID/release")
REL=$(echo "$RELEASE" | python3 -c "import sys,json; print(json.load(sys.stdin)['released'])")
check_status "Release issue" "True" "$REL"

# ── 9. Budget Policy ──
echo ""
echo "▸ Budget Policy"
BP=$(curl -sf -X POST "$BASE/budget-policies" -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$CID\",\"scopeType\":\"company\",\"windowKind\":\"monthly\",\"amount\":100000}")
BPID=$(echo "$BP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$BPID" ] && ok "Create budget policy ($BPID)" || fail "Create budget policy" "no id"

# ── 10. Approval ──
echo ""
echo "▸ Approval"
APPR=$(curl -sf -X POST "$BASE/approvals" -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$CID\",\"type\":\"new_agent_hire\",\"payload\":{\"name\":\"new-agent\"}}")
APID=$(echo "$APPR" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$APID" ] && ok "Create approval ($APID)" || fail "Create approval" "no id"

DECIDE=$(curl -sf -X PATCH "$BASE/approvals/$APID" -H 'Content-Type: application/json' \
  -d '{"status":"approved","decidedByUserId":"local-board"}')
DSTATUS=$(echo "$DECIDE" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
check_status "Approve" "approved" "$DSTATUS"

# ── 11. Secret ──
echo ""
echo "▸ Secret"
SEC=$(curl -sf -X POST "$BASE/secrets" -H 'Content-Type: application/json' \
  -d "{\"companyId\":\"$CID\",\"name\":\"E2E_KEY\",\"value\":\"secret123\"}")
SECID=$(echo "$SEC" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
[ -n "$SECID" ] && ok "Create secret ($SECID)" || fail "Create secret" "no id"

SLIST=$(curl -sf "$BASE/secrets?companyId=$CID" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")
check_status "List secrets count" "1" "$SLIST"

curl -sf -X DELETE "$BASE/secrets/$SECID" > /dev/null
ok "Delete secret"

# ── 12. Agent Token ──
echo ""
echo "▸ Agent Token"
TOKEN=$(curl -sf -X POST "$BASE/agents/$AID/token" | python3 -c "import sys,json; t=json.load(sys.stdin).get('token',''); print('yes' if len(t)>10 else 'no')")
check_status "Generate agent JWT" "yes" "$TOKEN"

# ── 13. Export/Import ──
echo ""
echo "▸ Export/Import"
PREVIEW=$(curl -sf -X POST "$BASE/companies/$CID/exports/preview")
ECNT=$(echo "$PREVIEW" | python3 -c "import sys,json; print(json.load(sys.stdin)['counts']['agents'])")
check_status "Export preview agents" "1" "$ECNT"

EXPORT=$(curl -sf -X POST "$BASE/companies/$CID/exports")
ENAME=$(echo "$EXPORT" | python3 -c "import sys,json; print(json.load(sys.stdin)['company']['name'])")
check_status "Export company name" "E2E Updated Co" "$ENAME"

# ── 14. Auth ──
echo ""
echo "▸ Auth"
SIGNUP=$(curl -sf -X POST "$BASE/auth/signup" -H 'Content-Type: application/json' \
  -d "{\"email\":\"e2e-$(date +%s)@test.com\",\"password\":\"testpass123\",\"name\":\"E2E User\"}")
STOKEN=$(echo "$SIGNUP" | python3 -c "import sys,json; t=json.load(sys.stdin).get('token',''); print('yes' if len(t)>10 else 'no')")
check_status "Signup" "yes" "$STOKEN"

# ── Cleanup ──
echo ""
echo "▸ Cleanup"
curl -sf -X DELETE "$BASE/goals/$GID" > /dev/null && ok "Delete goal" || fail "Delete goal" "failed"
curl -sf -X DELETE "$BASE/issues/$IID" > /dev/null && ok "Delete issue" || fail "Delete issue" "failed"
curl -sf -X DELETE "$BASE/projects/$PID" > /dev/null && ok "Delete project" || fail "Delete project" "failed"
curl -sf -X DELETE "$BASE/budget-policies/$BPID" > /dev/null && ok "Delete budget policy" || fail "Delete budget policy" "failed"
# Note: agent/company deletion skipped — FK constraints from heartbeat_runs prevent cascade delete.
# This is by design: runs are an audit trail and shouldn't be silently deleted.
ok "Cleanup complete (agent+company retained due to run history)"

# ── Summary ──
echo ""
echo "═══════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════"

[ "$FAIL" -eq 0 ] && exit 0 || exit 1
