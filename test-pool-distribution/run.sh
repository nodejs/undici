#!/bin/bash

# Cleanup function
cleanup() {
  echo -e "\n\nCleaning up..."
  kill $BACKEND1 $BACKEND2 $BACKEND3 $BACKEND4 $BACKEND5 $LB 2>/dev/null
  exit
}

trap cleanup SIGINT SIGTERM

echo "Starting backend servers..."
node backend.js 3001 &
BACKEND1=$!
node backend.js 3002 &
BACKEND2=$!
node backend.js 3003 &
BACKEND3=$!
node backend.js 3004 &
BACKEND4=$!
node backend.js 3005 &
BACKEND5=$!

sleep 1

echo "Starting load balancer..."
node lb.js &
LB=$!

sleep 1

echo "Running test..."
echo "======================================"
node test.js

cleanup

