'use strict'

const { createServer } = require('http')
const { once } = require('events')

/* global expect, it, jest, AbortController */

// https://github.com/facebook/jest/issues/11607#issuecomment-899068995
jest.useRealTimers()

const runIf = (condition) => condition ? it : it.skip
const nodeMajor = Number(process.versions.node.split('.', 1)[0])

runIf(nodeMajor >= 16)('isErrorLike sanity check', () => {
  const { isErrorLike } = require('../../lib/fetch/util')
  const { DOMException } = require('../../lib/fetch/constants')
  const error = new DOMException('')

  // https://github.com/facebook/jest/issues/2549
  expect(error instanceof Error).toBeFalsy()
  expect(isErrorLike(error)).toBeTruthy()
})

runIf(nodeMajor >= 16)('Real use-case', async () => {
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
