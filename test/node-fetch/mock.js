/* eslint no-unused-expressions: "off" */

// Test tools
const chai = require('chai')

const {
  fetch,
  MockAgent,
  setGlobalDispatcher,
  getGlobalDispatcher
} = require('../../index.js')

const { expect } = chai

describe('node-fetch with MockAgent', () => {
  let _prevGlobalDispatcher
  let mockAgent

  before(() => {
    _prevGlobalDispatcher = getGlobalDispatcher()
    mockAgent = new MockAgent()
    setGlobalDispatcher(mockAgent)
  })

  after(() => {
    setGlobalDispatcher(_prevGlobalDispatcher)
  })

  it('should work', async () => {
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
})
