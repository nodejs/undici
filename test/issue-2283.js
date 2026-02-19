'use strict'

const { describe, test } = require('node:test')
const { FormData, Response } = require('..')

describe('https://github.com/nodejs/undici/issues/2283', () => {
  test('preserve full type when parsing multipart/form-data', async (t) => {
    const testBlob = new Blob(['123'], { type: 'text/plain;charset=utf-8' })
    const fd = new FormData()
    fd.set('x', testBlob)
    const res = new Response(fd)

    const body = await res.clone().text()

    // Just making sure that it contains ;charset=utf-8
    t.assert.ok(body.includes('text/plain;charset=utf-8'))

    const formData = await new Response(fd).formData()

    // returns just 'text/plain'
    t.assert.ok(formData.get('x').type === 'text/plain;charset=utf-8')
  })
})
