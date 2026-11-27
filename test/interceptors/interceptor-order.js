'use strict'

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { Agent, interceptors, cacheStores } = require('../../')

// The cache interceptor must be composed after the redirect interceptor so that
// the cache handler runs below the redirect handler and observes the redirect
// history. Composing it before the redirect silently disables the cache's
// cross-origin and credential-bearing redirect guards (GHSA-75VM-9G8F-99J4,
// GHSA-MQG3-3V4R-CM32, GHSA-4W7W-5XRC-9H26, GHSA-7XG3-FPHP-28HG).

const cache = () => interceptors.cache({ store: new cacheStores.MemoryCacheStore(), type: 'shared' })
const redirect = () => interceptors.redirect({ maxRedirections: 2 })
const deduplicate = () => interceptors.deduplicate()

test('compose rejects cache composed before redirect', () => {
  assert.throws(
    () => new Agent().compose(cache(), redirect()),
    /must be composed after the redirect interceptor/
  )

  assert.throws(
    () => new Agent().compose(cache(), deduplicate(), redirect()),
    /must be composed after the redirect interceptor/
  )

  assert.throws(
    () => new Agent().compose(deduplicate(), cache(), redirect()),
    /must be composed after the redirect interceptor/
  )
})

test('compose allows cache composed after redirect regardless of deduplicate position', () => {
  assert.doesNotThrow(() => new Agent().compose(redirect(), cache()))
  assert.doesNotThrow(() => new Agent().compose(redirect(), deduplicate(), cache()))
  assert.doesNotThrow(() => new Agent().compose(deduplicate(), redirect(), cache()))
  assert.doesNotThrow(() => new Agent().compose(redirect(), cache(), deduplicate()))
})

test('compose allows cache, redirect, and deduplicate on their own', () => {
  assert.doesNotThrow(() => new Agent().compose(cache()))
  assert.doesNotThrow(() => new Agent().compose(redirect()))
  assert.doesNotThrow(() => new Agent().compose(deduplicate()))
})

test('compose allows unrelated interceptors with cache', () => {
  assert.doesNotThrow(() => new Agent().compose(
    interceptors.retry({ maxRetries: 1 }),
    cache()
  ))
})
