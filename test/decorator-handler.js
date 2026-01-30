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

      onRequestStart (controller, context) {
        return this.#handler?.onRequestStart?.(controller, context)
      }

      onResponseStart (controller, statusCode, headers, statusMessage) {
        return this.#handler?.onResponseStart?.(controller, statusCode, headers, statusMessage)
      }

      onRequestUpgrade (controller, statusCode, headers, socket) {
        return this.#handler?.onRequestUpgrade?.(controller, statusCode, headers, socket)
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
        t = tspl(t, { plan: 3 })
        const handler = new Handler(
          {
            onRequestStart: (controller, ctx) => {
              t.equal(typeof controller, 'object')
              t.equal(typeof controller.abort, 'function')
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

    describe('#onResponseStart', () => {
      test('should delegate onResponseStart-method', t => {
        t = tspl(t, { plan: 4 })
        const handler = new Handler(
          {
            onResponseStart: (controller, statusCode, headers, statusMessage) => {
              t.equal(statusCode, 200)
              t.equal(headers['content-type'], 'application/json')
              t.equal(typeof controller.resume, 'function')
              t.equal(statusMessage, 'OK')
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
        }))
      })
    })

    describe('#onRequestUpgrade', () => {
      test('should delegate onRequestUpgrade-method', t => {
        t = tspl(t, { plan: 3 })
        const handler = new Handler(
          {
            onRequestUpgrade: (_controller, statusCode, headers, socket) => {
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
        }))
      })
    })

    describe('#onResponseData', () => {
      test('should delegate onResponseData-method', t => {
        t = tspl(t, { plan: 1 })
        const handler = new Handler(
          {
            onResponseData: (_controller, chunk) => {
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
        t = tspl(t, { plan: 1 })
        const handler = new Handler(
          {
            onResponseEnd: (_controller, trailers) => {
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
      test('should delegate onResponseError-method', t => {
        t = tspl(t, { plan: 1 })
        const handler = new Handler(
          {
            onResponseError: (_controller, err) => {
              t.equal(err.message, 'Oops!')
            }
          })
        const decorator = new DecoratorHandler(handler)
        decorator.onResponseError(new Controller(), new Error('Oops!'))
      })

      test('should not throw if onResponseError-method is not defined in the handler', t => {
        t = tspl(t, { plan: 1 })
        const decorator = new DecoratorHandler({})
        t.doesNotThrow(() => decorator.onResponseError(new Controller(), new Error('Oops!')))
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
      test('should delegate onResponseError-method', t => {
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

      test('should throw if onResponseError-method is not defined in the handler', t => {
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
