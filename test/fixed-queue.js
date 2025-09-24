'use strict'

const { test } = require('node:test')

const FixedQueue = require('../lib/dispatcher/fixed-queue')

test('fixed queue 1', (t) => {
  t.plan(5)

  const queue = new FixedQueue()
  t.assert.strictEqual(queue.head, queue.tail)
  t.assert.ok(queue.isEmpty())
  queue.push('a')
  t.assert.ok(!queue.isEmpty())
  t.assert.strictEqual(queue.shift(), 'a')
  t.assert.strictEqual(queue.shift(), null)
})

test('fixed queue 2', (t) => {
  t.plan(7 + 2047)

  const queue = new FixedQueue()
  for (let i = 0; i < 2047; i++) {
    queue.push('a')
  }
  t.assert.ok(queue.head.isFull())
  queue.push('a')
  t.assert.ok(!queue.head.isFull())

  t.assert.notEqual(queue.head, queue.tail)
  for (let i = 0; i < 2047; i++) {
    t.assert.strictEqual(queue.shift(), 'a')
  }
  t.assert.strictEqual(queue.head, queue.tail)
  t.assert.ok(!queue.isEmpty())
  t.assert.strictEqual(queue.shift(), 'a')
  t.assert.ok(queue.isEmpty())
})
