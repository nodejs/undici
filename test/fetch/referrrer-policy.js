'use strict'

const { once } = require('node:events')
const { createServer } = require('node:http')
const { describe, test } = require('node:test')
const { fetch } = require('../..')
const tspl = require('@matteo.collina/tspl')

describe('referrer-policy', () => {
  ;[
    [
      'should ignore empty string as policy',
      'origin, asdas, asdaw34, no-referrer,,',
      'no-referrer'
    ],
    [
      'should set referrer policy from response headers on redirect',
      'origin',
      'origin'
    ],
    [
      'should select the first valid police',
      'asdas, origin',
      'origin'
    ],
    [
      'should select the first valid policy #2',
      'no-referrer, asdas, origin, 0943sd',
      'origin'
    ],
    [
      'should pick the last fallback over invalid policy tokens',
      'origin, asdas, asdaw34',
      'origin'
    ],
    [
      'should set not change request referrer policy if no Referrer-Policy from initial redirect response',
      null,
      'strict-origin-when-cross-origin'
    ],
    [
      'should set not change request referrer policy if the policy is a non-valid Referrer Policy',
      'asdasd',
      'strict-origin-when-cross-origin'
    ],
    [
      'should set not change request referrer policy if the policy is a non-valid Referrer Policy #2',
      'asdasd, asdasa, 12daw,',
      'strict-origin-when-cross-origin'
    ],

    [
      'referrer policy is origin',
      'origin',
      'origin'
    ],
    [
      'referrer policy is no-referrer',
      'no-referrer',
      'no-referrer'
    ],
    [
      'referrer policy is strict-origin-when-cross-origin',
      'strict-origin-when-cross-origin',
      'strict-origin-when-cross-origin'
    ],
    [
      'referrer policy is unsafe-url',
      'unsafe-url',
      'unsafe-url'
    ]
  ].forEach(([title, responseReferrerPolicy, expectedReferrerPolicy, referrer]) => {
    test(title, async (t) => {
      t = tspl(t, { plan: 1 })

      const server = createServer((req, res) => {
        switch (res.req.url) {
          case '/redirect':
            res.writeHead(302, undefined, {
              Location: '/target',
              'referrer-policy': responseReferrerPolicy
            })
            res.end()
            break
          case '/target':
            switch (expectedReferrerPolicy) {
              case 'no-referrer':
                t.strictEqual(req.headers['referer'], undefined)
                break
              case 'origin':
                t.strictEqual(req.headers['referer'], `http://127.0.0.1:${port}/`)
                break
              case 'strict-origin-when-cross-origin':
                t.strictEqual(req.headers['referer'], `http://127.0.0.1:${port}/index.html?test=1`)
                break
              case 'unsafe-url':
                t.strictEqual(req.headers['referer'], `http://127.0.0.1:${port}/index.html?test=1`)
                break
            }
            res.writeHead(200, 'dummy', { 'Content-Type': 'text/plain' })
            res.end()
            break
        }
      })

      server.listen(0)
      await once(server, 'listening')

      const { port } = server.address()
      await fetch(`http://127.0.0.1:${port}/redirect`, {
        referrer: referrer || `http://127.0.0.1:${port}/index.html?test=1`
      })

      await t.completed

      server.closeAllConnections()
      server.closeIdleConnections()
      server.close()
      await once(server, 'close')
    })
  })
})
