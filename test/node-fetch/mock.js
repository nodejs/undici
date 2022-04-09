/* eslint no-unused-expressions: "off" */

// Test tools
const chai = require('chai')

const {
  fetch,
  MockAgent,
  setGlobalDispatcher,
  Headers
} = require('../../index.js')

const { expect } = chai

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

    expect(res.status).to.equal(200)
    expect(await res.json()).to.deep.equal({ success: true })
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

    expect(res.status).to.equal(200)
    expect(await res.json()).to.deep.equal({ success: true })
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
    expect(res.status).to.equal(200)
    expect(await res.json()).to.deep.equal({ success: true })
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
          expect(headers).to.be.an('object')
          expect(headers).to.have.property('user-agent', 'undici')
          return true
        }
      })
      .reply(200, { success: true })
      .persist()

    const res = await fetch('http://localhost:3000/test', {
      method: 'GET',
      headers: new Headers({ 'User-Agent': 'undici' })
    })

    expect(res.status).to.equal(200)
    expect(await res.json()).to.deep.equal({ success: true })
  })
})
