const { describe, it } = require('node:test')
const { cleanRequestHeaders } = require('../lib/handler/redirect-handler')
const assert = require('node:assert')

describe('clean-request-headers', () => {
  const baseHeaderArray = ['content-type', 'application/json', 'accept-ranges', 'bytes']

  it('Should clean request header as expected when it is an array', () => {
    const headerArray = structuredClone(baseHeaderArray)

    const cleanedRequestHeaders = cleanRequestHeaders(headerArray)

    assert.ok(cleanedRequestHeaders.every((headerKeyValue) => baseHeaderArray.includes(headerKeyValue)), true)
    assert.ok(cleanedRequestHeaders.length === baseHeaderArray.length, true)
  })

  it('Should clean request header as expected when it is a string record object', () => {
    const headersObject = { 'content-type': 'application/json', 'accept-ranges': 'bytes' }

    const cleanedRequestHeaders = cleanRequestHeaders(headersObject)

    assert.ok(cleanedRequestHeaders.every((headerKeyValue) => baseHeaderArray.includes(headerKeyValue)), true)
    assert.ok(cleanedRequestHeaders.length === baseHeaderArray.length, true)
  })

  it('Should clean request header as expected when it is a Headers native object', () => {
    const headers = new Headers({ 'content-type': 'application/json', 'accept-ranges': 'bytes' })

    const cleanedRequestHeaders = cleanRequestHeaders(headers)

    assert.ok(cleanedRequestHeaders.every((headerKeyValue) => baseHeaderArray.includes(headerKeyValue)), true)
    assert.ok(cleanedRequestHeaders.length === baseHeaderArray.length, true)
  })
})
