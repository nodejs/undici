'use strict'

const { test } = require('tap')

const provider = require('../lib/compat/weakref-provider')

let originalWeakRef

test('WeakRef provider', (t) => {
  t.plan(2)

  t.beforeEach(() => {
    originalWeakRef = global.WeakRef
  })

  t.afterEach(() => {
    global.WeakRef = originalWeakRef
  })

  t.test('should return global implementation if available', t => {
    t.plan(1)

    class GlobalWeakRef {};
    global.WeakRef = GlobalWeakRef

    const result = provider.provide()

    t.equal(result, GlobalWeakRef)
  })

  t.test('should return compat implementation if global one is not available', t => {
    t.plan(4)

    let WeakRefImpl

    t.beforeEach(() => {
      global.WeakRef = undefined
      WeakRefImpl = provider.provide()
    })

    t.afterEach(() => {
      global.WeakRef = originalWeakRef
    })

    t.test('should collect if there are no active connections and no running/pending requests', t => {
      t.plan(1)

      const client = { connected: 0, size: 0 }
      const weakRef = new WeakRefImpl(client)

      const result = weakRef.deref()

      t.equal(result, undefined)
    })

    t.test('should not collect if there are active connections', t => {
      t.plan(1)

      const client = { connected: 1, size: 0 }
      const weakRef = new WeakRefImpl(client)

      const result = weakRef.deref()

      t.equal(result, client)
    })

    t.test('should not collect if there are running/pending requests', t => {
      t.plan(1)

      const client = { connected: 0, size: 1 }
      const weakRef = new WeakRefImpl(client)

      const result = weakRef.deref()

      t.equal(result, client)
    })

    t.test('should not collect if there are active connections and running/pending requests', t => {
      t.plan(1)

      const client = { connected: 1, size: 1 }
      const weakRef = new WeakRefImpl(client)

      const result = weakRef.deref()

      t.equal(result, client)
    })
  })
})
