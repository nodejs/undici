'use strict'

const { test } = require('tap')
const {
  Response
} = require('../../')

test('arg validation', (t) => {
  // constructor
  t.throws(() => {
    // eslint-disable-next-line
    new Response(null, 0)
  }, TypeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: 99
    })
  }, RangeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: 600
    })
  }, RangeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      status: '600'
    })
  }, TypeError)
  t.throws(() => {
    // eslint-disable-next-line
    new Response(null, {
      statusText: '\u0000'
    })
  }, TypeError)

  for (const nullStatus of [204, 205, 304]) {
    t.throws(() => {
      // eslint-disable-next-line
      new Response(new ArrayBuffer(16), {
        status: nullStatus
      })
    }, TypeError)
  }

  t.throws(() => {
    Response.prototype[Symbol.toStringTag].call(null)
  }, TypeError)

  t.throws(() => {
    Response.prototype.type.call(null)
  }, TypeError)

  t.throws(() => {
    Response.prototype.url.call(null)
  }, TypeError)

  t.throws(() => {
    Response.prototype.redirected.call(null)
  }, TypeError)

  t.throws(() => {
    Response.prototype.status.call(null)
  }, TypeError)

  t.throws(() => {
    Response.prototype.ok.call(null)
  }, TypeError)

  t.throws(() => {
    Response.prototype.statusText.call(null)
  }, TypeError)

  t.throws(() => {
    Response.prototype.headers.call(null)
  }, TypeError)

  t.throws(() => {
    Response.prototype.clone.call(null)
  }, TypeError)

  t.end()
})

test('response clone', (t) => {
  // https://github.com/nodejs/undici/issues/1122
  const response1 = new Response(null, { status: 201 })
  const response2 = new Response(undefined, { status: 201 })

  t.equal(response1.body, response1.clone().body)
  t.equal(response2.body, response2.clone().body)
  t.equal(response2.body, null)
  t.end()
})
