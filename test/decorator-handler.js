'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test } = require('node:test')
const DecoratorHandler = require('../lib/handler/decorator-handler')

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
})
