// Measure the per-dispatch overhead that Dispatcher.compose() introduces
// relative to a raw dispatcher, so docs that recommend composition can be
// cross-referenced to concrete numbers.
//
// Scope: construction + composed-dispatch property-access cost. These are
// deterministic, have no network dependency, and are what every retry /
// cache / mock composition pays per request before any real work happens.
//
// Not measured here: end-to-end latency over a socket (covered by
// benchmarks/benchmark.js) or interceptor-handler cost (depends on the
// interceptor's own work).

import { bench, group, run } from 'mitata'
import { Agent, interceptors } from '../../index.js'

const retryFactory = interceptors.retry({ maxRetries: 0 })
const redirectFactory = interceptors.redirect({ maxRedirections: 0 })

// Construct dispatchers once; benchmarks measure the hot path only.
const rawAgent = new Agent()
const retryComposed = new Agent().compose(retryFactory)
const redirectComposed = new Agent().compose(redirectFactory)
const chainComposed = new Agent().compose([retryFactory, redirectFactory])

group('construction', () => {
  bench('new Agent()', () => new Agent())
  bench('Agent().compose(retry)', () => new Agent().compose(retryFactory))
  bench('Agent().compose(redirect)', () => new Agent().compose(redirectFactory))
  bench('Agent().compose([retry, redirect])', () =>
    new Agent().compose([retryFactory, redirectFactory]))
})

// The property-access cost on the Proxy returned by compose() — this is what
// every dispatch() call pays before entering the first interceptor.
group('dispatch property access (Proxy overhead)', () => {
  bench('raw.dispatch', () => rawAgent.dispatch)
  bench('composed(retry).dispatch', () => retryComposed.dispatch)
  bench('composed(redirect).dispatch', () => redirectComposed.dispatch)
  bench('composed([retry, redirect]).dispatch', () => chainComposed.dispatch)
})

await run()

await rawAgent.close()
await retryComposed.close()
await redirectComposed.close()
await chainComposed.close()
