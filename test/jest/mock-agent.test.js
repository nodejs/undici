'use strict'

const { afterEach } = require('tap')
const { request, setGlobalDispatcher, MockAgent } = require('../..')
const { getResponse } = require('../../lib/mock/mock-utils')

/* global describe, it, expect */

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
