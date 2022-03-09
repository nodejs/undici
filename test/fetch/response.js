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
  }, RangeError)
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

// https://github.com/web-platform-tests/wpt/pull/32825
test('Response.json WPTs', async (t) => {
  t.test('WPT tests', async (t) => {
    const APPLICATION_JSON = 'application/json;charset=utf-8'
    const FOO_BAR = 'foo/bar'

    const INIT_TESTS = [
      [undefined, 200, '', APPLICATION_JSON, {}],
      [{ status: 400 }, 400, '', APPLICATION_JSON, {}],
      [{ statusText: 'foo' }, 200, 'foo', APPLICATION_JSON, {}],
      [{ headers: {} }, 200, '', APPLICATION_JSON, {}],
      [{ headers: { 'content-type': FOO_BAR } }, 200, '', FOO_BAR, {}],
      // TODO: ensure that the status text was missing here and not supposed to be APPLICATION_JSON
      [{ headers: { 'x-foo': 'bar' } }, 200, '', APPLICATION_JSON, { 'x-foo': 'bar' }]
    ]

    for (const [init, status, statusText, contentType, headers] of INIT_TESTS) {
      const response = Response.json('hello world', init)
      t.equal(response.type, 'default', "Response's type is default")
      t.equal(response.status, status, "Response's status is " + status)
      t.equal(response.statusText, statusText, "Response's statusText is " + JSON.stringify(statusText))
      t.equal(response.headers.get('content-type'), contentType, "Response's content-type is " + contentType)
      for (const key in headers) {
        t.equal(response.headers.get(key), headers[key], "Response's header " + key + ' is ' + JSON.stringify(headers[key]))
      }

      const data = await response.json()
      t.equal(data, 'hello world', "Response's body is 'hello world'")
    }

    t.end()
  })

  t.test('throws with null body statuses', (t) => {
    const nullBodyStatus = [204, 205, 304]
    nullBodyStatus.forEach((status) => {
      t.throws(
        () => Response.json('hello world', { status }),
        TypeError,
        `Throws TypeError when calling static json() with a status of ${status}`
      )
    })

    t.end()
  })

  t.test('Check static json() encodes JSON objects correctly', async (t) => {
    const response = Response.json({ foo: 'bar' })
    const data = await response.json()
    t.equal(typeof data, 'object', "Response's json body is an object")
    t.equal(data.foo, 'bar', "Response's json body is { foo: 'bar' }")

    t.end()
  })

  // unserializable
  t.throws(() => {
    Response.json(Symbol('foo'))
  }, TypeError)

  class CustomError extends Error {}

  // This test should ensure that a CustomError is being thrown.
  // It does do so, but tap doesn't seem to recognize it.
  t.throws(() => {
    Response.json({ get foo() { throw new CustomError("bar") } })
  })

  t.end()
})
