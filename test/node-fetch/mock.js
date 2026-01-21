'use strict'

// Test tools
const { describe, it } = require('node:test')

const {
  fetch,
  MockAgent,
  setGlobalDispatcher,
  Headers
} = require('../../index.js')

describe('node-fetch with MockAgent', () => {
  it('should match the url', async (t) => {
    const mockAgent = new MockAgent()
    setGlobalDispatcher(mockAgent)
    const mockPool = mockAgent.get('http://localhost:3000')

    mockPool
      .intercept({
        path: '/test',
        method: 'GET'
      })
      .reply(200, { success: true })
      .persist()

    const res = await fetch('http://localhost:3000/test', {
      method: 'GET'
    })

    t.assert.strictEqual(res.status, 200)
    t.assert.deepStrictEqual(await res.json(), { success: true })
  })

  it('should match the body', async (t) => {
    const mockAgent = new MockAgent()
    setGlobalDispatcher(mockAgent)
    const mockPool = mockAgent.get('http://localhost:3000')

    mockPool
      .intercept({
        path: '/test',
        method: 'POST',
        body: (value) => {
          return value === 'request body'
        }
      })
      .reply(200, { success: true })
      .persist()

    const res = await fetch('http://localhost:3000/test', {
      method: 'POST',
      body: 'request body'
    })

    t.assert.strictEqual(res.status, 200)
    t.assert.deepStrictEqual(await res.json(), { success: true })
  })

  it('should match the headers', async (t) => {
    const mockAgent = new MockAgent()
    setGlobalDispatcher(mockAgent)
    const mockPool = mockAgent.get('http://localhost:3000')

    mockPool
      .intercept({
        path: '/test',
        method: 'GET',
        headers: (h) => {
          return h['user-agent'] === 'undici'
        }
      })
      .reply(200, { success: true })
      .persist()

    const res = await fetch('http://localhost:3000/test', {
      method: 'GET',
      headers: new Headers({ 'User-Agent': 'undici' })
    })

    t.assert.strictEqual(res.status, 200)
    t.assert.deepStrictEqual(await res.json(), { success: true })
  })

  it('should match the headers with a matching function', async (t) => {
    const mockAgent = new MockAgent()
    setGlobalDispatcher(mockAgent)
    const mockPool = mockAgent.get('http://localhost:3000')

    mockPool
      .intercept({
        path: '/test',
        method: 'GET',
        headers (headers) {
          t.assert.strictEqual(typeof headers, 'object')
          t.assert.strictEqual(headers['user-agent'], 'undici')
          return true
        }
      })
      .reply(200, { success: true })
      .persist()

    const res = await fetch('http://localhost:3000/test', {
      method: 'GET',
      headers: new Headers({ 'User-Agent': 'undici' })
    })

    t.assert.strictEqual(res.status, 200)
    t.assert.deepStrictEqual(await res.json(), { success: true })
  })
})
