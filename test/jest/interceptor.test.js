'use strict'

const { createServer } = require('http')
const { Agent, request } = require('../../index')
const DecoratorHandler = require('../../lib/handler/DecoratorHandler')
/* global expect */

const defaultOpts = { keepAliveTimeout: 10, keepAliveMaxTimeout: 10 }

describe('interceptors', () => {
  let server
  beforeEach(async () => {
    server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/plain')
      res.end('hello')
    })
    await new Promise((resolve) => { server.listen(0, resolve) })
  })
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  test('interceptors are applied on client from an agent', async () => {
    const interceptors = []
    const buildInterceptor = dispatch => {
      const interceptorContext = { requestCount: 0 }
      interceptors.push(interceptorContext)
      return (opts, handler) => {
        interceptorContext.requestCount++
        return dispatch(opts, handler)
      }
    }

    const opts = { interceptors: { Client: [buildInterceptor] }, ...defaultOpts }
    const agent = new Agent(opts)
    const origin = new URL(`http://localhost:${server.address().port}`)
    await Promise.all([
      request(origin, { dispatcher: agent }),
      request(origin, { dispatcher: agent })
    ])

    // Assert that the requests are run on different interceptors (different Clients)
    const requestCounts = interceptors.map(x => x.requestCount)
    expect(requestCounts).toEqual([1, 1])
  })

  test('interceptors are applied in the correct order', async () => {
    const setHeaderInterceptor = (dispatch) => {
      return (opts, handler) => {
        opts.headers.push('foo', 'bar')
        return dispatch(opts, handler)
      }
    }

    const assertHeaderInterceptor = (dispatch) => {
      return (opts, handler) => {
        expect(opts.headers).toEqual(['foo', 'bar'])
        return dispatch(opts, handler)
      }
    }

    const opts = { interceptors: { Pool: [setHeaderInterceptor, assertHeaderInterceptor] }, ...defaultOpts }
    const agent = new Agent(opts)
    const origin = new URL(`http://localhost:${server.address().port}`)
    await request(origin, { dispatcher: agent, headers: [] })
  })

  test('interceptors handlers are called in reverse order', async () => {
    const clearResponseHeadersInterceptor = (dispatch) => {
      return (opts, handler) => {
        class ResultInterceptor extends DecoratorHandler {
          onHeaders (statusCode, headers, resume) {
            return super.onHeaders(statusCode, [], resume)
          }
        }

        return dispatch(opts, new ResultInterceptor(handler))
      }
    }

    const assertHeaderInterceptor = (dispatch) => {
      return (opts, handler) => {
        class ResultInterceptor extends DecoratorHandler {
          onHeaders (statusCode, headers, resume) {
            expect(headers).toEqual([])
            return super.onHeaders(statusCode, headers, resume)
          }
        }

        return dispatch(opts, new ResultInterceptor(handler))
      }
    }

    const opts = { interceptors: { Agent: [assertHeaderInterceptor, clearResponseHeadersInterceptor] }, ...defaultOpts }
    const agent = new Agent(opts)
    const origin = new URL(`http://localhost:${server.address().port}`)
    await request(origin, { dispatcher: agent, headers: [] })
  })
})

describe('interceptors with NtlmRequestHandler', () => {
  class FakeNtlmRequestHandler {
    constructor (dispatch, opts, handler) {
      this.dispatch = dispatch
      this.opts = opts
      this.handler = handler
      this.requestCount = 0
    }

    onConnect (...args) {
      return this.handler.onConnect(...args)
    }

    onError (...args) {
      return this.handler.onError(...args)
    }

    onUpgrade (...args) {
      return this.handler.onUpgrade(...args)
    }

    onHeaders (statusCode, headers, resume, statusText) {
      this.requestCount++
      if (this.requestCount < 2) {
        // Do nothing
      } else {
        return this.handler.onHeaders(statusCode, headers, resume, statusText)
      }
    }

    onData (...args) {
      if (this.requestCount < 2) {
        // Do nothing
      } else {
        return this.handler.onData(...args)
      }
    }

    onComplete (...args) {
      if (this.requestCount < 2) {
        this.dispatch(this.opts, this)
      } else {
        return this.handler.onComplete(...args)
      }
    }

    onBodySent (...args) {
      if (this.requestCount < 2) {
        // Do nothing
      } else {
        return this.handler.onBodySent(...args)
      }
    }
  }
  let server

  beforeEach(async () => {
    // This Test is important because NTLM and Negotiate require several
    // http requests in sequence to run on the same keepAlive socket

    const socketRequestCountSymbol = Symbol('Socket Request Count')
    server = createServer((req, res) => {
      if (req.socket[socketRequestCountSymbol] === undefined) {
        req.socket[socketRequestCountSymbol] = 0
      }
      req.socket[socketRequestCountSymbol]++
      res.setHeader('Content-Type', 'text/plain')

      // Simulate NTLM/Negotiate logic, by returning 200
      // on the second request of each socket
      if (req.socket[socketRequestCountSymbol] >= 2) {
        res.statusCode = 200
        res.end()
      } else {
        res.statusCode = 401
        res.end()
      }
    })
    await new Promise((resolve) => { server.listen(0, resolve) })
  })
  afterEach(async () => {
    await new Promise((resolve) => server.close(resolve))
  })

  test('Retry interceptor on Client will use the same socket', async () => {
    const interceptor = dispatch => {
      return (opts, handler) => {
        return dispatch(opts, new FakeNtlmRequestHandler(dispatch, opts, handler))
      }
    }
    const opts = { interceptors: { Client: [interceptor] }, ...defaultOpts }
    const agent = new Agent(opts)
    const origin = new URL(`http://localhost:${server.address().port}`)
    const { statusCode } = await request(origin, { dispatcher: agent, headers: [] })
    expect(statusCode).toEqual(200)
  })
})
