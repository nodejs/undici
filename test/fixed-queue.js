'use strict'

const { test } = require('tap')

const FixedQueue = require('../lib/node/fixed-queue')

test('fixed queue 1', (t) => {
  t.plan(5)

  const queue = new FixedQueue()
  t.strictEqual(queue.head, queue.tail)
  t.ok(queue.isEmpty())
  queue.push('a')
  t.ok(!queue.isEmpty())
  t.strictEqual(queue.shift(), 'a')
  t.strictEqual(queue.shift(), null)
})

test('fixed queue 2', (t) => {
  t.plan(7 + 2047)

  const queue = new FixedQueue()
  for (let i = 0; i < 2047; i++) {
    queue.push('a')
  }
  t.ok(queue.head.isFull())
  queue.push('a')
  t.ok(!queue.head.isFull())

  t.notStrictEqual(queue.head, queue.tail)
  for (let i = 0; i < 2047; i++) {
    t.strictEqual(queue.shift(), 'a')
  }
  t.strictEqual(queue.head, queue.tail)
  t.ok(!queue.isEmpty())
  t.strictEqual(queue.shift(), 'a')
  t.ok(queue.isEmpty())
})
