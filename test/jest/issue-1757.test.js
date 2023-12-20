'use strict'

const { Dispatcher, setGlobalDispatcher, MockAgent } = require('../..')

/* global expect, it */

class MiniflareDispatcher extends Dispatcher {
  constructor (inner, options) {
    super(options)
    this.inner = inner
  }

  dispatch (options, handler) {
    return this.inner.dispatch(options, handler)
  }

  close (...args) {
    return this.inner.close(...args)
  }

  destroy (...args) {
    return this.inner.destroy(...args)
  }
}

it('https://github.com/nodejs/undici/issues/1757', async () => {
  // fetch isn't exported in <16.8
  const { fetch } = require('../..')

  const mockAgent = new MockAgent()
  const mockClient = mockAgent.get('http://localhost:3000')
  mockAgent.disableNetConnect()
  setGlobalDispatcher(new MiniflareDispatcher(mockAgent))

  mockClient.intercept({
    path: () => true,
    method: () => true
  }).reply(200, async (opts) => {
    if (opts.body?.[Symbol.asyncIterator]) {
      const chunks = []
      for await (const chunk of opts.body) {
        chunks.push(chunk)
      }

      return Buffer.concat(chunks)
    }

    return opts.body
  })

  const response = await fetch('http://localhost:3000', {
    method: 'POST',
    body: JSON.stringify({ foo: 'bar' })
  })

  expect(response.json()).resolves.toMatchObject({ foo: 'bar' })
  expect(response.status).toBe(200)
})
