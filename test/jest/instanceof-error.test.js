'use strict'

const { createServer } = require('node:http')
const { once } = require('node:events')

/* global expect, it, jest, AbortController */

// https://github.com/facebook/jest/issues/11607#issuecomment-899068995
jest.useRealTimers()

it('isErrorLike sanity check', () => {
  const { isErrorLike } = require('../../lib/web/fetch/util')
  const error = new DOMException('')

  // https://github.com/facebook/jest/issues/2549
  expect(error instanceof Error).toBeFalsy()
  expect(isErrorLike(error)).toBeTruthy()
})

it('Real use-case', async () => {
  const { fetch } = require('../..')

  const ac = new AbortController()
  ac.abort()

  const server = createServer((req, res) => {
    res.end()
  }).listen(0)

  await once(server, 'listening')

  const promise = fetch(`https://localhost:${server.address().port}`, {
    signal: ac.signal
  })

  await expect(promise).rejects.toThrowError(/^Th(e|is) operation was aborted\.?$/)

  server.close()
  await once(server, 'close')
})
