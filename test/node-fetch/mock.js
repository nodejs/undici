'use strict'

// Test tools
const assert = require('node:assert')
const { describe, it } = require('node:test')

const {
  fetch,
  MockAgent,
  setGlobalDispatcher,
  Headers
} = require('../../index.js')

describe('node-fetch with MockAgent', () => {
  it('should match the url', async () => {
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

    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(await res.json(), { success: true })
  })

  it('should match the body', async () => {
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

    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(await res.json(), { success: true })
  })

  it('should match the headers', async () => {
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

    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(await res.json(), { success: true })
  })

  it('should match the headers with a matching function', async () => {
    const mockAgent = new MockAgent()
    setGlobalDispatcher(mockAgent)
    const mockPool = mockAgent.get('http://localhost:3000')

    mockPool
      .intercept({
        path: '/test',
        method: 'GET',
        headers (headers) {
          assert.strictEqual(typeof headers, 'object')
          assert.strictEqual(headers['user-agent'], 'undici')
          return true
        }
      })
      .reply(200, { success: true })
      .persist()

    const res = await fetch('http://localhost:3000/test', {
      method: 'GET',
      headers: new Headers({ 'User-Agent': 'undici' })
    })

    assert.strictEqual(res.status, 200)
    assert.deepStrictEqual(await res.json(), { success: true })
  })
})
