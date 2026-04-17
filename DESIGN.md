# Design proposal: make `Agent` protocol-aware without synthetic origin suffixes

## Audience and assumptions

This note is written for undici maintainers.

It assumes the current context around:
- the legacy global dispatcher wrapper forcing `allowH2: false`
- `Agent` currently distinguishing HTTP/1-only dispatchers by appending `#http1-only` to the origin key
- `MockAgent` and other internal consumers needing to reason about the same dispatcher registry

## Summary

The current `#http1-only` key suffix works as a short-term fix, but it encodes routing state into a string key that other internals can accidentally depend on.

## Implementation status

This branch implements the first substantial slice of the design:
- `Agent` now keeps separate default and HTTP/1-only dispatcher registries
- `Agent` exposes internal symbol-based query/mutation helpers for those registries
- `MockAgent` uses those helpers instead of sharing `Agent`'s raw pool map

The remaining design goal is to continue reducing coupling around mock dispatcher lifecycle and diagnostics.

As an incremental starting step, `MockAgent.get(origin)` can eagerly register both protocol buckets for string origins and make them share the same interceptor list. That removes the lazy repair currently needed during dispatch, while keeping behaviour correct for native `fetch()`.

That step is still transitional. The longer-term goal is to make `Agent` explicitly protocol-aware without exposing its pool registry shape to `MockAgent` or any other internal consumer.

A less brittle design is to make `Agent` explicitly protocol-aware:
- keep separate dispatcher maps for
  - normal protocol-negotiating dispatchers
  - HTTP/1-only dispatchers
- provide internal methods to query and mutate those maps by `(origin, allowH2)`
- stop requiring other modules to know how `Agent` encodes that distinction internally

In particular, `MockAgent` should not need to know that HTTP/1-only dispatchers were historically represented as `origin + '#http1-only'`.

## Problem statement

Today, `Agent` stores dispatchers in a single map and synthesizes the map key from both:
- the request origin
- the routing constraint `allowH2 === false`

Conceptually, the key space is:
- `https://example.com`
- `https://example.com#http1-only`

That has a few problems.

### 1. Routing semantics are encoded into a string

The suffix is not part of the origin. It is an internal transport-selection detail.

Encoding that detail into a string key makes it easy for other code to accidentally couple to:
- the exact suffix value
- the fact that the distinction is implemented as string concatenation
- suffix-based filtering such as `endsWith('#http1-only')`

That is brittle because the representation leaks across module boundaries.

### 2. Other internals need to reimplement `Agent` knowledge

The regression behind #5036 happened because:
- `Dispatcher1Wrapper` forced `allowH2: false`
- `Agent` routed native `fetch()` through the HTTP/1-only bucket
- `MockAgent` had registered interceptors under the plain origin bucket only

The direct bug was fixed, but the deeper issue remains: `MockAgent` still needs protocol-bucket knowledge from `Agent`.

Even if the suffix string is centralized, the architectural dependency is still present.

### 3. One map now mixes two different dimensions

The current map combines:
- identity: `origin`
- policy: whether the dispatcher may negotiate HTTP/2

Those are different concerns.

The implementation is simpler if the registry explicitly models both.

## Goals

1. Remove synthetic suffix parsing from internal consumers.
2. Make the dispatcher registry explicitly protocol-aware.
3. Let other internals query dispatcher state through methods, not key conventions.
4. Avoid exposing `Agent`'s underlying pool registry shape to `MockAgent`.
5. Preserve the current observable behaviour.
6. Keep the implementation internal; this does not need to become public API.

## Non-goals

- Redesigning the external `Agent` API
- Changing how ALPN or `allowH2` semantics work
- Unifying `MockAgent` and `Agent` into one type

## Proposed design

## 1. Split `Agent` storage into two maps

Instead of one `kClients` map with encoded keys, keep two explicit maps:

- `kClients`
  - dispatchers for the normal path
  - key: plain origin
  - meaning: requests that may use the agent's configured protocol behaviour
- `kHttp1OnlyClients`
  - dispatchers for requests forced to HTTP/1.1
  - key: plain origin
  - meaning: requests with `allowH2 === false`

This preserves the current behaviour while making the distinction explicit.

Example shape:

```js
const kClients = Symbol('clients')
const kHttp1OnlyClients = Symbol('http1-only clients')
```

Then `Agent` chooses the map directly:

```js
const clients = allowH2 === false ? this[kHttp1OnlyClients] : this[kClients]
const result = clients.get(origin)
```

This removes the need for:
- synthetic origin keys
- suffix concatenation
- suffix filtering

## 2. Add internal query/mutation methods on `Agent`

The important change is not only storing entries separately, but also making `Agent` the owner of the lookup rules.

These methods should not expose the raw registry maps or require `MockAgent` to manipulate pool entries directly. The point is to hide the storage shape behind internal semantics.

Internal consumers should ask `Agent` questions like:
- "give me the dispatcher entry for this origin and routing mode"
- "set a dispatcher entry for this origin and routing mode"
- "delete the dispatcher entry for this origin and routing mode"
- "does this origin still have any dispatchers in either map?"

A reasonable internal surface would be symbol-based methods rather than new public methods.

For example:

```js
const kGetDispatcherEntry = Symbol('get dispatcher entry')
const kSetDispatcherEntry = Symbol('set dispatcher entry')
const kDeleteDispatcherEntry = Symbol('delete dispatcher entry')
const kHasDispatcherForOrigin = Symbol('has dispatcher for origin')
const kForEachDispatcherEntry = Symbol('for each dispatcher entry')
```

Conceptually:

```js
agent[kGetDispatcherEntry](origin, { allowH2 })
agent[kSetDispatcherEntry](origin, { allowH2 }, entry)
agent[kDeleteDispatcherEntry](origin, { allowH2 })
agent[kHasDispatcherForOrigin](origin)
agent[kForEachDispatcherEntry]((entry, meta) => { ... })
```

Why symbol methods are preferable here:
- they keep the surface internal
- they avoid blessing these methods as supported public API
- they let `MockAgent` and similar internals depend on semantics, not representation

## 3. Make `MockAgent` depend on the query methods, not the storage shape

`MockAgent` currently reaches into agent internals and effectively shares the underlying client registry.

That coupling is what made the suffix matter.

With the proposed design, `MockAgent` should ask `Agent` for the correct bucket by routing mode rather than constructing keys itself.

At minimum, that means:
- no string concatenation to build HTTP/1-only keys
- no suffix-based filtering when enumerating pending interceptors
- no assumptions about how `Agent` partitions dispatcher entries

A better internal structure for `MockAgent` is:
- interceptor registries keyed by normalized origin only
- dispatcher instances resolved through `Agent` protocol-aware queries

That separates two concerns cleanly:
- **mock matching**: keyed by logical origin and request properties
- **transport routing**: keyed by origin plus protocol policy

### Why this matters

The interceptors should be logically attached to the origin, not to an implementation-specific registry key.

Whether the request took:
- the default path
- the HTTP/1-only path

should not change how interceptors are matched or reported.

## 4. Iterate across both maps through one helper

Several `Agent` operations need to consider all dispatcher entries:
- `close()`
- `destroy()`
- `stats`
- origin cleanup

Those should not manually duplicate logic.

Add one internal iterator/helper that visits both maps.

Conceptually:

```js
forEachDispatcherEntry (fn) {
  for (const [origin, entry] of this[kClients]) {
    fn(entry, { origin, allowH2: this[kOptions].allowH2 !== false })
  }

  for (const [origin, entry] of this[kHttp1OnlyClients]) {
    fn(entry, { origin, allowH2: false })
  }
}
```

That gives the implementation one place to define what counts as "all dispatchers".

## Alternative shapes considered

## A. Keep the suffix, but centralize it

This is the current stopgap direction.

Pros:
- minimal code churn
- fixes the immediate regression

Cons:
- still leaks implementation details across modules
- still requires suffix-aware filtering and reasoning
- still mixes identity and routing policy in one string key

This is acceptable as a short-term patch, but not ideal as the long-term design.

## B. Nested map: `Map<origin, { default, http1Only }>`

This is also a valid design.

Pros:
- models both dispatchers under the same origin naturally
- origin cleanup becomes straightforward

Cons:
- slightly more bookkeeping in the hot path
- more complex mutation code than two direct maps

This would be more explicit than the suffix approach and is arguably the cleanest data model.

I still slightly prefer two maps plus query methods because:
- it keeps hot-path lookups very direct
- it maps closely to the current implementation
- it minimizes migration cost

That said, nested maps would also solve the brittleness problem.

## Detailed behaviour proposal

## Dispatcher lookup

Given `(origin, allowH2)`:
- if `allowH2 === false`, use the HTTP/1-only registry
- otherwise use the default registry

No encoded key should be constructed.

## Dispatcher creation

When a dispatcher is missing:
- create it using the appropriate options
- store it in the selected registry
- keep origin tracking separate from storage shape

## Origin tracking

`kOrigins` should reflect whether an origin exists in either registry.

That means:
- adding an entry in either map adds the origin
- deleting an entry removes the origin only if neither map still contains it

This is more robust than implicitly inferring it from encoded keys.

## Mock dispatcher association

If `MockAgent` needs both protocol-specific dispatchers to share the same interceptor list, that sharing should happen explicitly, not via key convention.

For example, `MockAgent` can maintain:

```js
Map<origin, dispatches>
```

and then create protocol-specific mock dispatchers that each reference the same `dispatches` array.

This is preferable to storing duplicate logical state under two registry keys and then trying to filter one copy out of diagnostics.

## Migration plan

### Phase 0: simplify the current `MockAgent` workaround

As a starting step, when `MockAgent.get(origin)` receives a concrete string origin:
- create the default mock dispatcher bucket
- create the HTTP/1-only mock dispatcher bucket as well
- make both dispatchers share the same interceptor list

This is still a stopgap, but it is better than lazily creating the HTTP/1-only bucket during dispatch because:
- the mirrored state is established at registration time
- native `fetch()` and normal undici requests see the same mock setup immediately
- `MockAgent.dispatch()` no longer needs to repair missing protocol buckets on the fly

This phase should not be treated as the final design because `MockAgent` still relies on `Agent`'s current registry convention.

### Phase 1: introduce protocol-aware storage in `Agent`

- add `kHttp1OnlyClients`
- add internal query/mutation helpers
- make `Agent`'s own lookup path use those helpers
- keep behaviour unchanged

### Phase 2: migrate internal consumers

Update `MockAgent` and any similar internal users to stop depending on:
- `origin + suffix`
- `endsWith(suffix)`
- direct assumptions about the shape of `agent[kClients]`

### Phase 3: remove suffix compatibility logic

Once all internal users are converted:
- delete key-suffix helpers
- delete any code that filters synthetic entries in diagnostics

## Testing plan

At minimum:

1. Existing regression test for native `fetch()` + `MockAgent`
2. Native `WebSocket` regression tests that motivated the HTTP/1-only routing
3. `MockAgent` pending interceptor diagnostics
4. `close()` / `destroy()` coverage for both dispatcher registries
5. Stats/origin cleanup behaviour when only one of the two registries is populated

Additional targeted tests:
- same origin can have both a default dispatcher and an HTTP/1-only dispatcher simultaneously
- deleting one does not remove the other
- deleting the last one removes the origin from origin tracking
- `MockAgent` interceptor reporting does not duplicate shared interceptor state

## Recommendation

Treat the current suffix-based fix as the compatibility patch, not the final architecture.

The long-term direction should be:
- explicit protocol-aware dispatcher registries in `Agent`
- internal query methods for dispatcher lookup and iteration
- `MockAgent` depending on those methods instead of key conventions

That design is less brittle because it makes the transport distinction explicit in the data model instead of hiding it inside a string.
