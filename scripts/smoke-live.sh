#!/usr/bin/env bash
# ==============================================================================
# Pantry Rescue — Live Deployment Smoke Test
# Usage:
#   ./scripts/smoke-live.sh https://your-service.onrender.com
#   ./scripts/smoke-live.sh http://127.0.0.1:3001
# ==============================================================================

set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3001}"
# Strip trailing slash if present
BASE_URL="${BASE_URL%/}"

COOKIE_JAR="$(mktemp -t pantry_smoke_cookies_XXXXXX 2>/dev/null || mktemp)"
trap 'rm -f "$COOKIE_JAR"' EXIT

TIMESTAMP="$(date +%s)"
RAND_SUFFIX="$((RANDOM % 9000 + 1000))"
TEST_EMAIL="smoke_${TIMESTAMP}_${RAND_SUFFIX}@example.com"
TEST_PASS="SmokePass123!"
ITEM_NAME="Smoke Test Item ${RAND_SUFFIX}"

echo "=============================================================="
echo "   Pantry Rescue — Live Deployment Smoke Test"
echo "   Target URL: ${BASE_URL}"
echo "=============================================================="

# ------------------------------------------------------------------------------
# Step 1: Health Check
# ------------------------------------------------------------------------------
echo -n "[Step 1/5] Checking /health endpoint... "
HEALTH_RESPONSE=$(curl -sS -w "\n%{http_code}" "${BASE_URL}/health")
HEALTH_CODE=$(echo "$HEALTH_RESPONSE" | tail -n1)
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | sed '$d')

if [ "$HEALTH_CODE" != "200" ]; then
  echo "FAILED (HTTP ${HEALTH_CODE})"
  echo "Response: ${HEALTH_BODY}"
  exit 1
fi

if ! echo "$HEALTH_BODY" | grep -q '"status":"ok"'; then
  echo "FAILED (Unexpected health body)"
  echo "Response: ${HEALTH_BODY}"
  exit 1
fi
echo "PASSED (HTTP 200, status: ok)"

# ------------------------------------------------------------------------------
# Step 2: Register Test User
# ------------------------------------------------------------------------------
echo -n "[Step 2/5] Registering test user (${TEST_EMAIL})... "
REG_PAYLOAD=$(printf '{"email":"%s","password":"%s","displayName":"Smoke Tester"}' "$TEST_EMAIL" "$TEST_PASS")

REG_RESPONSE=$(curl -sS -w "\n%{http_code}" -c "$COOKIE_JAR" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "$REG_PAYLOAD" \
  "${BASE_URL}/api/auth/register")

REG_CODE=$(echo "$REG_RESPONSE" | tail -n1)
REG_BODY=$(echo "$REG_RESPONSE" | sed '$d')

if [ "$REG_CODE" != "201" ]; then
  echo "FAILED (HTTP ${REG_CODE})"
  echo "Response: ${REG_BODY}"
  exit 1
fi

# Extract token if available for Bearer fallback
TOKEN=$(echo "$REG_BODY" | grep -o '"token":"[^"]*' | cut -d'"' -f4 || echo "")
echo "PASSED (HTTP 201, User Registered)"

AUTH_HEADER=()
if [ -n "$TOKEN" ]; then
  AUTH_HEADER=(-H "Authorization: Bearer ${TOKEN}")
fi

# ------------------------------------------------------------------------------
# Step 3: Create Test Household
# ------------------------------------------------------------------------------
echo -n "[Step 3/5] Creating test household... "
HH_PAYLOAD='{"name":"Live Smoke Test Kitchen","weeklyWasteTarget":2.0}'

HH_RESPONSE=$(curl -sS -w "\n%{http_code}" -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  "${AUTH_HEADER[@]}" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "$HH_PAYLOAD" \
  "${BASE_URL}/api/households")

HH_CODE=$(echo "$HH_RESPONSE" | tail -n1)
HH_BODY=$(echo "$HH_RESPONSE" | sed '$d')

if [ "$HH_CODE" != "201" ]; then
  echo "FAILED (HTTP ${HH_CODE})"
  echo "Response: ${HH_BODY}"
  exit 1
fi

HH_ID=$(echo "$HH_BODY" | grep -o '"id":"[^"]*' | head -n1 | cut -d'"' -f4)
if [ -z "$HH_ID" ]; then
  echo "FAILED (Could not parse household ID)"
  echo "Response: ${HH_BODY}"
  exit 1
fi
echo "PASSED (HTTP 201, Household ID: ${HH_ID})"

# ------------------------------------------------------------------------------
# Step 4: Add an Active Pantry Item
# ------------------------------------------------------------------------------
echo -n "[Step 4/5] Adding pantry item (${ITEM_NAME})... "
ITEM_PAYLOAD=$(printf '{"name":"%s","category":"produce","quantity":3,"unit":"piece"}' "$ITEM_NAME")

ITEM_RESPONSE=$(curl -sS -w "\n%{http_code}" -b "$COOKIE_JAR" -c "$COOKIE_JAR" \
  "${AUTH_HEADER[@]}" \
  -H "Content-Type: application/json" \
  -X POST \
  -d "$ITEM_PAYLOAD" \
  "${BASE_URL}/api/households/${HH_ID}/items")

ITEM_CODE=$(echo "$ITEM_RESPONSE" | tail -n1)
ITEM_BODY=$(echo "$ITEM_RESPONSE" | sed '$d')

if [ "$ITEM_CODE" != "201" ]; then
  echo "FAILED (HTTP ${ITEM_CODE})"
  echo "Response: ${ITEM_BODY}"
  exit 1
fi
echo "PASSED (HTTP 201, Item Added)"

# ------------------------------------------------------------------------------
# Step 5: Read Back Inventory & Verify Item
# ------------------------------------------------------------------------------
echo -n "[Step 5/5] Reading back pantry inventory... "
LIST_RESPONSE=$(curl -sS -w "\n%{http_code}" -b "$COOKIE_JAR" \
  "${AUTH_HEADER[@]}" \
  "${BASE_URL}/api/households/${HH_ID}/items?status=active")

LIST_CODE=$(echo "$LIST_RESPONSE" | tail -n1)
LIST_BODY=$(echo "$LIST_RESPONSE" | sed '$d')

if [ "$LIST_CODE" != "200" ]; then
  echo "FAILED (HTTP ${LIST_CODE})"
  echo "Response: ${LIST_BODY}"
  exit 1
fi

if ! echo "$LIST_BODY" | grep -q "$ITEM_NAME"; then
  echo "FAILED (Created item '${ITEM_NAME}' not found in active inventory)"
  echo "Response: ${LIST_BODY}"
  exit 1
fi
echo "PASSED (HTTP 200, Item Verified in Inventory)"

echo ""
echo "=============================================================="
echo "  🎉 LIVE SMOKE TEST PASSED! All endpoints functional."
echo "=============================================================="
exit 0
