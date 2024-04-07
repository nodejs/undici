'use strict'

const { once } = require('node:events')
const fc = require('fast-check')
const netServer = require('./server')
const { describe, before, after, test } = require('node:test')
const {
  clientFuzzBody,
  clientFuzzHeaders,
  clientFuzzOptions
} = require('./client')

// Detect if running in CI (here we use GitHub Workflows)
// https://docs.github.com/en/actions/learn-github-actions/variables#default-environment-variables
const isCI = process.env.CI === 'true'

fc.configureGlobal({
  interruptAfterTimeLimit: isCI ? 60_000 /* 1 minute */ : 10_000 /* 10 seconds */,
  numRuns: Number.MAX_SAFE_INTEGER
})

describe('fuzzing', { timeout: 600_000 /* 10 minutes */ }, () => {
  before(async () => {
    netServer.listen(0)
    await once(netServer, 'listening')
  })

  after(() => {
    netServer.close()
  })

  test('body', async () => {
    const address = `http://localhost:${netServer.address().port}`
    await fc.assert(
      fc.asyncProperty(fc.uint8Array(), async (body) => {
        body = Buffer.from(body)
        const results = {}
        await clientFuzzBody(address, results, body)
      })
    )
  })

  test('headers', async () => {
    const address = `http://localhost:${netServer.address().port}`
    await fc.assert(
      fc.asyncProperty(fc.uint8Array(), async (body) => {
        body = Buffer.from(body)
        const results = {}
        await clientFuzzHeaders(address, results, body)
      })
    )
  })

  test('options', async () => {
    const address = `http://localhost:${netServer.address().port}`
    await fc.assert(
      fc.asyncProperty(fc.uint8Array(), async (body) => {
        body = Buffer.from(body)
        const results = {}
        await clientFuzzOptions(address, results, body)
      })
    )
  })
})
