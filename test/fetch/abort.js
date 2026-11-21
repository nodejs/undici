'use strict'

const { test } = require('node:test')
const { fetch } = require('../..')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { closeServerAsPromise } = require('../utils/node-http')

test('allows aborting with custom errors', async (t) => {
  const server = createServer({ joinDuplicateHeaders: true }).listen(0)

  t.after(closeServerAsPromise(server))
  await once(server, 'listening')

  await t.test('Using AbortSignal.timeout with cause', async (t) => {
    t.plan(2)
    try {
      await fetch(`http://localhost:${server.address().port}`, {
        signal: AbortSignal.timeout(50)
      })
      t.assert.fail('should throw')
    } catch (err) {
      if (err.name === 'TypeError') {
        const cause = err.cause
        t.assert.strictEqual(cause.name, 'HeadersTimeoutError')
        t.assert.strictEqual(cause.code, 'UND_ERR_HEADERS_TIMEOUT')
      } else if (err.name === 'TimeoutError') {
        t.assert.strictEqual(err.code, DOMException.TIMEOUT_ERR)
        t.assert.strictEqual(err.cause, undefined)
      } else {
        throw err
      }
    }
  })

  t.test('Error defaults to an AbortError DOMException', async () => {
    const ac = new AbortController()
    ac.abort() // no reason

    await t.assert.rejects(
      fetch(`http://localhost:${server.address().port}`, {
        signal: ac.signal
      }),
      {
        name: 'AbortError',
        code: DOMException.ABORT_ERR
      }
    )
  })
})

// https://github.com/nodejs/undici/issues/6231
test('preserves abort reasons, including falsy values (#6231)', async (t) => {
  const customReason = new Error('custom abort reason')
  const cases = [
    { name: 'false', reason: false },
    { name: '0', reason: 0 },
    { name: 'empty string', reason: '' },
    { name: 'custom Error', reason: customReason }
  ]

  await t.test('while reading the response body', async (t) => {
    const server = createServer({ joinDuplicateHeaders: true }, (_req, res) => {
      res.write('partial body')
    })

    t.after(() => {
      server.closeAllConnections()
      return closeServerAsPromise(server)()
    })

    server.listen(0)
    await once(server, 'listening')

    const url = `http://localhost:${server.address().port}`

    for (const { name, reason } of cases) {
      await t.test(`rejects with ${name}`, async (t) => {
        const controller = new AbortController()
        const response = await fetch(url, { signal: controller.signal })
        const reading = response.text()
        controller.abort(reason)

        const rejection = await reading.then(
          () => {
            throw new Error('Expected response.text() to reject')
          },
          (error) => error
        )

        t.assert.ok(
          Object.is(rejection, controller.signal.reason),
          `expected rejection to be Object.is-equal to signal.reason (${String(controller.signal.reason)}), got ${String(rejection)}`
        )
        t.assert.ok(
          Object.is(rejection, reason),
          `expected rejection to be Object.is-equal to abort reason (${String(reason)}), got ${String(rejection)}`
        )
      })
    }

    await t.test('rejects with AbortError when reason is omitted', async (t) => {
      const controller = new AbortController()
      const response = await fetch(url, { signal: controller.signal })
      const reading = response.text()
      controller.abort()

      const rejection = await reading.then(
        () => {
          throw new Error('Expected response.text() to reject')
        },
        (error) => error
      )

      t.assert.ok(
        Object.is(rejection, controller.signal.reason),
        `expected rejection to be Object.is-equal to signal.reason, got ${String(rejection)}`
      )
      t.assert.strictEqual(rejection.name, 'AbortError')
      t.assert.strictEqual(rejection.code, DOMException.ABORT_ERR)
      t.assert.ok(rejection instanceof DOMException)
    })
  })

  await t.test('while the fetch is still waiting for a response', async (t) => {
    const server = createServer({ joinDuplicateHeaders: true }, () => {
      // Intentionally never respond so the fetch stays pending until abort.
    })

    t.after(() => {
      server.closeAllConnections()
      return closeServerAsPromise(server)()
    })

    server.listen(0)
    await once(server, 'listening')

    const url = `http://localhost:${server.address().port}`

    for (const { name, reason } of cases) {
      await t.test(`rejects with ${name}`, async (t) => {
        const controller = new AbortController()
        const received = once(server, 'request')
        const pending = fetch(url, { signal: controller.signal })
        await received
        controller.abort(reason)

        const rejection = await pending.then(
          () => {
            throw new Error('Expected fetch() to reject')
          },
          (error) => error
        )

        t.assert.ok(
          Object.is(rejection, controller.signal.reason),
          `expected rejection to be Object.is-equal to signal.reason (${String(controller.signal.reason)}), got ${String(rejection)}`
        )
        t.assert.ok(
          Object.is(rejection, reason),
          `expected rejection to be Object.is-equal to abort reason (${String(reason)}), got ${String(rejection)}`
        )
      })
    }

    await t.test('rejects with AbortError when reason is omitted', async (t) => {
      const controller = new AbortController()
      const received = once(server, 'request')
      const pending = fetch(url, { signal: controller.signal })
      await received
      controller.abort()

      const rejection = await pending.then(
        () => {
          throw new Error('Expected fetch() to reject')
        },
        (error) => error
      )

      t.assert.ok(
        Object.is(rejection, controller.signal.reason),
        `expected rejection to be Object.is-equal to signal.reason, got ${String(rejection)}`
      )
      t.assert.strictEqual(rejection.name, 'AbortError')
      t.assert.strictEqual(rejection.code, DOMException.ABORT_ERR)
      t.assert.ok(rejection instanceof DOMException)
    })
  })
})
