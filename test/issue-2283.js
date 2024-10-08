'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test } = require('node:test')
const { FormData, Response } = require('..')

describe('https://github.com/nodejs/undici/issues/2283', () => {
  test('preserve full type when parsing multipart/form-data', async (t) => {
    t = tspl(t, { plan: 2 })
    const testBlob = new Blob(['123'], { type: 'text/plain;charset=utf-8' })
    const fd = new FormData()
    fd.set('x', testBlob)
    const res = new Response(fd)
    res.clone().text().then(body =>
      // Just making sure that it contains ;charset=utf-8
      t.ok(body.includes('text/plain;charset=utf-8'))
    )

    new Response(fd).formData().then(fd => {
      // returns just 'text/plain'
      t.ok(fd.get('x').type === 'text/plain;charset=utf-8')
    })

    await t.completed
  })
})
