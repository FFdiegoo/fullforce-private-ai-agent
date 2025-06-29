#!/bin/bash

echo "🚀 CSrental End-to-End Test Suite"
echo "=================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✅ PASS${NC}: $2"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}❌ FAIL${NC}: $2"
        ((TESTS_FAILED++))
    fi
}

echo "1. Testing Environment Variables..."
if [ -f ".env.local" ]; then
    test_result 0 ".env.local file exists"
else
    test_result 1 ".env.local file missing"
fi

echo ""
echo "2. Testing Dependencies..."
npm list @tailwindcss/forms > /dev/null 2>&1
test_result $? "@tailwindcss/forms installed"

npm list @tailwindcss/typography > /dev/null 2>&1
test_result $? "@tailwindcss/typography installed"

echo ""
echo "3. Testing Build Process..."
npm run build > /dev/null 2>&1
test_result $? "Next.js build successful"

echo ""
echo "4. Testing Database Connection..."
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
supabase.from('document_chunks').select('count').limit(1).then(r => {
  if (r.error) throw r.error;
  console.log('Database connection successful');
  process.exit(0);
}).catch(e => {
  console.error('Database connection failed:', e.message);
  process.exit(1);
});
" 2>/dev/null
test_result $? "Supabase database connection"

echo ""
echo "5. Testing OpenAI Connection..."
node -e "
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
openai.models.list().then(() => {
  console.log('OpenAI connection successful');
  process.exit(0);
}).catch(e => {
  console.error('OpenAI connection failed:', e.message);
  process.exit(1);
});
" 2>/dev/null
test_result $? "OpenAI API connection"

echo ""
echo "6. Testing Vector Search Function..."
node -e "
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const testEmbedding = new Array(1536).fill(0.1);
supabase.rpc('match_documents', {
  query_embedding: testEmbedding,
  match_threshold: 0.1,
  match_count: 1
}).then(r => {
  if (r.error) throw r.error;
  console.log('Vector search function works');
  process.exit(0);
}).catch(e => {
  console.error('Vector search failed:', e.message);
  process.exit(1);
});
" 2>/dev/null
test_result $? "Vector search function"

echo ""
echo "7. Testing Development Server..."
timeout 10s npm run dev > /dev/null 2>&1 &
SERVER_PID=$!
sleep 5

curl -s http://localhost:3000 > /dev/null 2>&1
SERVER_RESPONSE=$?
kill $SERVER_PID 2>/dev/null

test_result $SERVER_RESPONSE "Development server responds"

echo ""
echo "=================================="
echo -e "Test Results: ${GREEN}$TESTS_PASSED passed${NC}, ${RED}$TESTS_FAILED failed${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! CSrental is ready for production.${NC}"
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed. Please check the issues above.${NC}"
    exit 1
fi