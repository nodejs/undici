#!/bin/bash

# Cleanup function
cleanup() {
  echo -e "\n\nCleaning up..."
  kill $BACKEND1 $BACKEND2 $BACKEND3 $BACKEND4 $BACKEND5 $LB 2>/dev/null
  wait 2>/dev/null
}

trap cleanup SIGINT SIGTERM EXIT

echo "=========================================="
echo "Pool Distribution Comparison Test"
echo "=========================================="
echo ""

# Start backends
echo "Starting 5 backend servers (ports 3001-3005)..."
node backend.js 3001 > /dev/null 2>&1 &
BACKEND1=$!
node backend.js 3002 > /dev/null 2>&1 &
BACKEND2=$!
node backend.js 3003 > /dev/null 2>&1 &
BACKEND3=$!
node backend.js 3004 > /dev/null 2>&1 &
BACKEND4=$!
node backend.js 3005 > /dev/null 2>&1 &
BACKEND5=$!

sleep 1

echo "Starting load balancer on port 8080..."
node lb.js > /dev/null 2>&1 &
LB=$!

sleep 1

echo ""
echo "=========================================="
echo "TEST 1: Pool (original - buggy)"
echo "=========================================="
node test.js 2>/dev/null
echo ""
sleep 2

echo "=========================================="
echo "TEST 2: RoundRobinPool (fix)"
echo "=========================================="
node test-round-robin-pool.js 2>/dev/null
echo ""
sleep 2

echo "=========================================="
echo "TEST 3: BalancedPool (different use case)"
echo "=========================================="
kill $LB 2>/dev/null  # BalancedPool doesn't need LB
sleep 1
node test-balanced-pool.js 2>/dev/null

echo ""
echo "=========================================="
echo "Summary:"
echo "- Pool: Always picks first available → uneven"
echo "- RoundRobinPool: Round-robin selection → even"
echo "- BalancedPool: Multiple origins → even (but different use case)"
echo "=========================================="

