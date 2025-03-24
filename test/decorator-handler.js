'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test } = require('node:test')
const DecoratorHandler = require('../lib/handler/decorator-handler')

describe('DecoratorHandler', () => {
  test('should throw if provided handler is not an object', t => {
    t = tspl(t, { plan: 4 })
    t.throws(
      () => new DecoratorHandler(null),
      new TypeError('handler must be an object')
    )
    t.throws(
      () => new DecoratorHandler('string'),
      new TypeError('handler must be an object')
    )

    t.throws(
      () => new DecoratorHandler(null),
      new TypeError('handler must be an object')
    )
    t.throws(
      () => new DecoratorHandler('string'),
      new TypeError('handler must be an object')
    )
  })

  describe('wrap', () => {
    const Handler = class {
      #handler = null
      constructor (handler) {
        this.#handler = handler
      }

      onConnect (abort, context) {
        return this.#handler?.onConnect?.(abort, context)
      }

      onHeaders (statusCode, rawHeaders, resume, statusMessage) {
        return this.#handler?.onHeaders?.(statusCode, rawHeaders, resume, statusMessage)
      }

      onUpgrade (statusCode, rawHeaders, socket) {
        return this.#handler?.onUpgrade?.(statusCode, rawHeaders, socket)
      }

      onData (data) {
        return this.#handler?.onData?.(data)
      }

      onComplete (trailers) {
        return this.#handler?.onComplete?.(trailers)
      }

      onError (err) {
        return this.#handler?.onError?.(err)
      }
    }
    const Controller = class {
      #controller = null
      constructor (controller) {
        this.#controller = controller
      }

      abort (reason) {
        return this.#controller?.abort?.(reason)
      }

      resume () {
        return this.#controller?.resume?.()
      }

      pause () {
        return this.#controller?.pause?.()
      }
    }

    describe('#onConnect', () => {
      test('should delegate onConnect-method', t => {
        t = tspl(t, { plan: 2 })
        const handler = new Handler(
          {
            onConnect: (abort, ctx) => {
              t.equal(typeof abort, 'function')
              t.equal(typeof ctx, 'object')
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onRequestStart(new Controller(), {})
      })

      test('should not throw if onConnect-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.doesNotThrow(() => decorator.onRequestStart())
      })
    })

    describe('#onHeaders', () => {
      test('should delegate onHeaders-method', t => {
        t = tspl(t, { plan: 4 })
        const handler = new Handler(
          {
            onHeaders: (statusCode, headers, resume, statusMessage) => {
              t.equal(statusCode, '200')
              t.equal(`${headers[0].toString('utf-8')}: ${headers[1].toString('utf-8')}`, 'content-type: application/json')
              t.equal(typeof resume, 'function')
              t.equal(statusMessage, 'OK')
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onResponseStart(new Controller(), 200, {
          'content-type': 'application/json'
        }, 'OK')
      })

      test('should not throw if onHeaders-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.doesNotThrow(() => decorator.onResponseStart(new Controller(), 200, {
          'content-type': 'application/json'
        }))
      })
    })

    describe('#onUpgrade', () => {
      test('should delegate onUpgrade-method', t => {
        t = tspl(t, { plan: 3 })
        const handler = new Handler(
          {
            onUpgrade: (statusCode, headers, socket) => {
              t.equal(statusCode, 301)
              t.equal(`${headers[0].toString('utf-8')}: ${headers[1].toString('utf-8')}`, 'content-type: application/json')
              t.equal(typeof socket, 'object')
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onRequestUpgrade(new Controller(), 301, {
          'content-type': 'application/json'
        }, {})
      })

      test('should not throw if onUpgrade-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.doesNotThrow(() => decorator.onRequestUpgrade(new Controller(), 301, {
          'content-type': 'application/json'
        }))
      })
    })

    describe('#onData', () => {
      test('should delegate onData-method', t => {
        t = tspl(t, { plan: 1 })
        const handler = new Handler(
          {
            onData: (chunk) => {
              t.equal('chunk', chunk)
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onResponseData(new Controller(), 'chunk')
      })

      test('should not throw if onData-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.doesNotThrow(() => decorator.onResponseData(new Controller(), 'chunk'))
      })
    })

    describe('#onComplete', () => {
      test('should delegate onComplete-method', t => {
        t = tspl(t, { plan: 1 })
        const handler = new Handler(
          {
            onComplete: (trailers) => {
              t.equal(`${trailers[0].toString('utf-8')}: ${trailers[1].toString('utf-8')}`, 'x-trailer: trailer')
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onResponseEnd(new Controller(), { 'x-trailer': 'trailer' })
      })

      test('should not throw if onComplete-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.doesNotThrow(() => decorator.onResponseEnd(new Controller(), { 'x-trailer': 'trailer' }))
      })
    })

    describe('#onError', () => {
      test('should delegate onError-method', t => {
        t = tspl(t, { plan: 1 })
        const handler = new Handler(
          {
            onError: (err) => {
              t.equal(err.message, 'Oops!')
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onResponseError(new Controller(), new Error('Oops!'))
      })

      test('should throw if onError-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.throws(() => decorator.onResponseError(new Controller(), new Error('Oops!')))
      })
    })
  })

  describe('no-wrap', () => {
    const Handler = class {
      #handler = null
      constructor (handler) {
        this.#handler = handler
      }

      onRequestStart (controller, context) {
        return this.#handler?.onRequestStart?.(controller, context)
      }

      onRequestUpgrade (controller, statusCode, headers, socket) {
        return this.#handler?.onRequestUpgrade?.(controller, statusCode, headers, socket)
      }

      onResponseStart (controller, statusCode, headers, statusMessage) {
        return this.#handler?.onResponseStart?.(controller, statusCode, headers, statusMessage)
      }

      onResponseData (controller, data) {
        return this.#handler?.onResponseData?.(controller, data)
      }

      onResponseEnd (controller, trailers) {
        return this.#handler?.onResponseEnd?.(controller, trailers)
      }

      onResponseError (controller, err) {
        return this.#handler?.onResponseError?.(controller, err)
      }
    }
    const Controller = class {
      #controller = null
      constructor (controller) {
        this.#controller = controller
      }

      abort (reason) {
        return this.#controller?.abort?.(reason)
      }

      resume () {
        return this.#controller?.resume?.()
      }

      pause () {
        return this.#controller?.pause?.()
      }
    }

    describe('#onRequestStart', () => {
      test('should delegate onRequestStart-method', t => {
        t = tspl(t, { plan: 2 })
        const handler = new Handler(
          {
            onRequestStart: (controller, ctx) => {
              t.equal(controller.constructor, Controller)
              t.equal(typeof ctx, 'object')
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onRequestStart(new Controller(), {})
      })

      test('should not throw if onRequestStart-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.doesNotThrow(() => decorator.onRequestStart())
      })
    })

    describe('#onRequestUpgrade', () => {
      test('should delegate onRequestUpgrade-method', t => {
        t = tspl(t, { plan: 4 })
        const handler = new Handler(
          {
            onRequestUpgrade: (controller, statusCode, headers, socket) => {
              t.equal(controller.constructor, Controller)
              t.equal(statusCode, 301)
              t.equal(headers['content-type'], 'application/json')
              t.equal(typeof socket, 'object')
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onRequestUpgrade(new Controller(), 301, {
          'content-type': 'application/json'
        }, {})
      })

      test('should not throw if onRequestUpgrade-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.doesNotThrow(() => decorator.onRequestUpgrade(new Controller(), 301, {
          'content-type': 'application/json'
        }, {}))
      })
    })

    describe('#onResponseStart', () => {
      test('should delegate onResponseStart-method', t => {
        t = tspl(t, { plan: 4 })
        const handler = new Handler(
          {
            onResponseStart: (controller, statusCode, headers, message) => {
              t.equal(controller.constructor, Controller)
              t.equal(statusCode, 200)
              t.equal(headers['content-type'], 'application/json')
              t.equal(message, 'OK')
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onResponseStart(new Controller(), 200, {
          'content-type': 'application/json'
        }, 'OK')
      })

      test('should not throw if onResponseStart-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.doesNotThrow(() => decorator.onResponseStart(new Controller(), 200, {
          'content-type': 'application/json'
        }, 'OK'))
      })
    })

    describe('#onResponseData', () => {
      test('should delegate onResponseData-method', t => {
        t = tspl(t, { plan: 2 })
        const handler = new Handler(
          {
            onResponseData: (controller, chunk) => {
              t.equal(controller.constructor, Controller)
              t.equal('chunk', chunk)
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onResponseData(new Controller(), 'chunk')
      })

      test('should not throw if onResponseData-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.doesNotThrow(() => decorator.onResponseData(new Controller(), 'chunk'))
      })
    })

    describe('#onResponseEnd', () => {
      test('should delegate onResponseEnd-method', t => {
        t = tspl(t, { plan: 2 })
        const handler = new Handler(
          {
            onResponseEnd: (controller, trailers) => {
              t.equal(controller.constructor, Controller)
              t.equal(trailers['x-trailer'], 'trailer')
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onResponseEnd(new Controller(), { 'x-trailer': 'trailer' })
      })

      test('should not throw if onResponseEnd-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.doesNotThrow(() => decorator.onResponseEnd(new Controller(), { 'x-trailer': 'trailer' }))
      })
    })

    describe('#onResponseError', () => {
      test('should delegate onError-method', t => {
        t = tspl(t, { plan: 2 })
        const handler = new Handler(
          {
            onResponseError: (controller, err) => {
              t.equal(controller.constructor, Controller)
              t.equal(err.message, 'Oops!')
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onResponseError(new Controller(), new Error('Oops!'))
      })

      test('should throw if onError-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({
          // To hin and not wrap the instance
          onRequestStart: () => {}
        })
        t.doesNotThrow(() => decorator.onResponseError(new Controller()))
      })
    })
  })
})
