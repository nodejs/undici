# Plan: Remove WrapHandler and use new handlers everywhere

## Goals
- Eliminate `lib/handler/wrap-handler.js` usage and legacy wrapping paths.
- Use the new handler API consistently across all dispatchers and APIs.
- Preserve backwards compatibility expectations via tests and documented migration.

## Phases
1. **Inventory + constraints** ✅
   - Enumerate all `WrapHandler` and `unwrap` usages (APIs, handlers, interceptors, tests).
   - Identify legacy handler behaviors relied upon by core dispatchers (header casing, stack traces, event ordering).
   - Legacy behavior constraints observed in wrappers:
     - `WrapHandler` converts new handler callbacks to legacy `onConnect/onHeaders/onData/onComplete`.
     - Headers/trailers are converted to raw arrays of `Buffer` pairs, preserving duplicate headers but not original casing.
     - `onHeaders`/`onData` return `false` to pause; `resume()` uses controller from new API.
     - `onError` validation differs: missing `onError` throws (`InvalidArgumentError`) in new API path.
     - `UnwrapHandler` converts legacy callbacks to new `onRequestStart/onResponseStart/...` using `parseHeaders`.
     - `UnwrapHandler` maintains pause/resume/abort semantics via `UnwrapController`.
   - Current usages (as of now):
     - `lib/api/api-request.js` (wrap handler)
     - `lib/api/api-stream.js` (wrap handler)
     - `lib/api/api-pipeline.js` (wrap handler)
     - `lib/api/api-upgrade.js` (wrap handler)
     - `lib/api/api-connect.js` (wrap handler)
     - `lib/dispatcher/dispatcher.js` (wrap interceptor handler)
     - `lib/dispatcher/dispatcher-base.js` (unwrap handler)
     - `lib/handler/retry-handler.js` (wrap handler)
     - `lib/handler/decorator-handler.js` (wrap handler)
     - `lib/mock/snapshot-agent.js` (wrap handler)
     - `lib/handler/wrap-handler.js` (implementation)
     - `lib/handler/unwrap-handler.js` (implementation)
     - `test/issue-3934.js` (WrapHandler coverage)
   - Legacy handler API usage in core pipeline:
     - `lib/core/request.js` (invokes `onConnect/onHeaders/onData/onComplete/onError/onUpgrade`)
     - `lib/dispatcher/client-h1.js` + `client-h2.js` (calls request `onConnect/onHeaders/onData/onComplete`)
     - `lib/dispatcher/dispatcher-base.js` (expects legacy handler unless unwrapped)
     - `lib/interceptor/cache.js` and `lib/web/fetch/index.js` (construct handlers with legacy callbacks)
     - `lib/mock/mock-utils.js` (emits legacy callbacks during mock responses)

2. **API surface migration** ✅
   - Update all API entry points (`api-request`, `api-stream`, `api-pipeline`, `api-upgrade`, `api-connect`) to pass only new-style handlers.
   - Remove conditional wrapping logic and any legacy adaptation code.

3. **Dispatcher integration** ✅
   - Ensure core dispatchers (`Client`, `Pool`, `Agent`, etc.) only accept/emit new handler API.
   - Remove `DispatcherBase` compatibility layers tied to legacy handler signatures.

4. **Handler layer cleanup** ✅
   - Delete `lib/handler/wrap-handler.js` and `lib/handler/unwrap-handler.js` if no longer needed.
   - Remove references in `lib/handler/*` and `lib/core/*`.

5. **Tests + expectations** ✅
   - Update/replace legacy handler tests to assert new handler API behavior.
   - Add migration/regression coverage for custom dispatchers using new handlers.
   - Run broader suites (`npm run test:unit`/`test:fetch`) and adjust WPT expectations only if behavior changes are intentional.

6. **Docs + migration notes** ✅
   - Update documentation to state legacy handler API is removed.
   - Add a migration note with example handler changes.

## Rollout
- Land in a major version or behind a feature flag if needed.
- Provide a deprecation period if consumer impact is high.
