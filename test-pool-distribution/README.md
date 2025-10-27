# Pool Load Distribution Test

This test demonstrates issue #3648 - Pool distributes load unevenly across connections.

It also demonstrates the fix: **RoundRobinPool** - a new class that applies BalancedPool's round-robin algorithm to Pool's single-origin use case.

## Setup

- 5 backend HTTP servers (ports 3001-3005) with 100-200ms response time
- TCP load balancer (port 8080) that round-robins connections
- Test client using Pool with 5 connections, sending 1 request every 50ms

## Run

```bash
./run.sh
```

Or manually:

```bash
# Terminal 1-5: Start backends
node backend.js 3001
node backend.js 3002
node backend.js 3003
node backend.js 3004
node backend.js 3005

# Terminal 6: Start load balancer
node lb.js

# Terminal 7: Run test
node test.js
```

## Expected vs Actual

**Expected:** Even distribution (~20% per backend)

**Actual:** Uneven distribution with some backends getting 2-4x more requests than others

This happens because Pool reuses the oldest connections first, rather than round-robining across all available connections.

## BalancedPool Comparison

BalancedPool distributes evenly but solves a **different problem**:
- **Pool**: Multiple connections to ONE origin (e.g., `http://service-a` via load balancer)
- **BalancedPool**: Round-robin across MULTIPLE origins (e.g., direct pod IPs)

Test BalancedPool with:
```bash
./run-balanced.sh
```

BalancedPool shows even distribution because it has round-robin logic (`kIndex` tracking). However:
- In Kubernetes, you typically don't know pod IPs upfront
- You use a Service DNS name, which load-balances at the TCP level
- This is where Pool's bug manifests

**Conclusion:** The fix should be in Pool's `[kGetDispatcher]()` to add round-robin like BalancedPool has.

## RoundRobinPool - The Fix

A new class that solves this issue:

```bash
./run-rr.sh
```

**RoundRobinPool**:
- Same API as Pool (`new RoundRobinPool(origin, { connections: 5 })`)
- Single origin (works with load balancers)
- Round-robin client selection from BalancedPool
- Even distribution → **✓ fixes the bug**

Implementation: `lib/dispatcher/round-robin-pool.js`

## Compare All Three

Run all tests in sequence:

```bash
./compare.sh
```

Shows side-by-side:
1. **Pool** - uneven (2-4x difference)
2. **RoundRobinPool** - even (~1.2x difference)
3. **BalancedPool** - even but different use case

