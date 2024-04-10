'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test } = require('node:test')
const DecoratorHandler = require('../lib/handler/decorator-handler')

const methods = [
  'onConnect',
  'onError',
  'onUpgrade',
  'onHeaders',
  'onResponseStarted',
  'onData',
  'onComplete',
  'onBodySent'
]

describe('DecoratorHandler', () => {
  test('should throw if provided handler is not an object', (t) => {
    t = tspl(t, { plan: 4 })
    t.throws(() => new DecoratorHandler(null), new TypeError('handler must be an object'))
    t.throws(() => new DecoratorHandler('string'), new TypeError('handler must be an object'))

    t.throws(() => new DecoratorHandler(null), new TypeError('handler must be an object'))
    t.throws(() => new DecoratorHandler('string'), new TypeError('handler must be an object'))
  })

  test('should not expose the handler', (t) => {
    t = tspl(t, { plan: 1 })
    const handler = {}
    const decorator = new DecoratorHandler(handler)
    t.strictEqual(Object.keys(decorator).length, 0)
  })

  methods.forEach((method) => {
    test(`should have delegate ${method} method`, (t) => {
      t = tspl(t, { plan: 1 })
      const decorator = new DecoratorHandler({})
      t.equal(typeof decorator[method], 'function')
    })

    test(`should delegate ${method}`, (t) => {
      t = tspl(t, { plan: 1 })
      const handler = { [method]: () => method }
      const decorator = new DecoratorHandler(handler)
      t.equal(decorator[method](), method)
    })

    test(`should delegate ${method} with arguments`, (t) => {
      t = tspl(t, { plan: 1 })
      const handler = { [method]: (...args) => args }
      const decorator = new DecoratorHandler(handler)
      t.deepStrictEqual(decorator[method](1, 2, 3), [1, 2, 3])
    })

    test(`can be extended and should delegate ${method}`, (t) => {
      t = tspl(t, { plan: 1 })

      class ExtendedHandler extends DecoratorHandler {
        [method] () {
          return method
        }
      }
      const decorator = new ExtendedHandler({})
      t.equal(decorator[method](), method)
    })
  })
})
