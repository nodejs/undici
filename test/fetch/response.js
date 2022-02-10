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

test('Response.json', async (t) => {
  t.ok(typeof Response.json === 'function')

  t.test('invalid arguments', (t) => {
    t.throws(() => {
      Response.json()
    }, TypeError)

    t.throws(() => {
      Response.json({}, null)
    }, TypeError)

    t.throws(() => {
      Response.json({}, 'Hello!') // non-object
    }, TypeError)

    t.end()
  })

  t.test('with init["status"]', (t) => {
    t.throws(() => {
      Response.json({ a: 'b' }, {
        status: 199
      })
    }, RangeError, 'status < 200')

    t.throws(() => {
      Response.json({ a: 'b' }, {
        status: 600
      })
    }, RangeError, 'status > 599')

    // null body statuses
    for (const status of [204, 205, 304]) {
      t.throws(() => {
        Response.json({ a: 'b' }, {
          status
        })
      }, TypeError, `status ${status} should throw`)
    }

    t.doesNotThrow(() => {
      Response.json({ a: 'b' }, { status: 200 })
    })

    const resp = Response.json({ a: 'b' }, { status: 200 })
    t.same(resp.status, 200)

    t.end()
  })

  t.test('with init["statusText"]', (t) => {
    t.throws(() => {
      Response.json({ a: 'b' }, {
        statusText: 'OK 🤣'
      })
    }, TypeError)

    // reason-phrase
    for (const statusText of ['OK', '\tHello\t', '123abcABC']) {
      t.doesNotThrow(() => {
        Response.json({ a: 'b' }, { statusText })
      })
    }

    const resp = Response.json({ a: 'b' }, { statusText: 'OK\t' })
    t.same(resp.statusText, 'OK\t')

    t.end()
  })

  t.test('with init["headers"]', (t) => {
    const resp1 = Response.json({ a: 'b' }, {
      headers: [
        ['a', 'b'],
        ['c', 'd']
      ]
    })

    t.same(resp1.headers.get('a'), 'b')
    t.same(resp1.headers.get('c'), 'd')
    t.same(resp1.headers.get('content-type'), 'application/json;charset=utf-8')

    const resp2 = Response.json({ a: 'b' }, {
      headers: [
        ['content-type', 'this/does_not_exist;and=more-stuff']
      ]
    })

    t.same(resp2.headers.get('content-type'), 'this/does_not_exist;and=more-stuff')

    const resp3 = Response.json({ a: 'b' })

    t.same(resp3.headers.get('content-type'), 'application/json;charset=utf-8')

    t.end()
  })

  t.test('Response.json\'s body', async (t) => {
    const resp1 = Response.json({ a: 'b' })

    t.same(await resp1.json(), { a: 'b' })
    
    t.end()
  })

  t.end()
})
