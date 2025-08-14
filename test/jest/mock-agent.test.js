'use strict'

const { request, setGlobalDispatcher, MockAgent } = require('../..')
const { getResponse } = require('../../lib/mock/mock-utils')

/* global describe, it, afterEach, expect */

describe('MockAgent', () => {
  let mockAgent

  afterEach(() => {
    mockAgent.close()
  })

  it('should work in jest', async () => {
    expect.assertions(4)

    const baseUrl = 'http://localhost:9999'

    mockAgent = new MockAgent()
    setGlobalDispatcher(mockAgent)
    const mockClient = mockAgent.get(baseUrl)

    mockClient.intercept({
      path: '/foo?hello=there&see=ya',
      method: 'POST',
      body: 'form1=data1&form2=data2'
    }).reply(200, { foo: 'bar' }, {
      headers: {
        'content-type': 'application/json'
      },
      trailers: { 'Content-MD5': 'test' }
    })

    const { statusCode, headers, trailers, body } = await request(`${baseUrl}/foo?hello=there&see=ya`, {
      method: 'POST',
      body: 'form1=data1&form2=data2'
    })
    expect(statusCode).toBe(200)
    expect(headers).toEqual({ 'content-type': 'application/json' })
    expect(trailers).toEqual({ 'content-md5': 'test' })

    const jsonResponse = JSON.parse(await getResponse(body))
    expect(jsonResponse).toEqual({ foo: 'bar' })
  })
})

describe('MockAgent with ignoreTrailingSlash option', () => {
  const trailingSlashUrl = 'http://localhost:9999/'
  const noTrailingSlashUrl = 'http://localhost:9999'

  it('should not remove trailing slash from origin if the option is not enable', async () => {
    const mockClient = new MockAgent()

    const dispatcherOne = mockClient.get(trailingSlashUrl)
    const dispatcherTwo = mockClient.get(noTrailingSlashUrl)

    expect(dispatcherOne).not.toBe(dispatcherTwo)
  })

  it('should remove trailing slash from origin if enabled the option', async () => {
    const mockClient = new MockAgent({ ignoreTrailingSlash: true })

    const dispatcherOne = mockClient.get(trailingSlashUrl)
    const dispatcherTwo = mockClient.get(noTrailingSlashUrl)

    expect(dispatcherOne).toBe(dispatcherTwo)
  })
})
