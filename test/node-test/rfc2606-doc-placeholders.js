'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const files = [
  'docs/docs/api/Dispatcher.md',
  'docs/docs/api/MockAgent.md',
  'docs/docs/api/ProxyAgent.md',
  'docs/docs/best-practices/crawling.md'
]

const disallowedHosts = [
  'test.com',
  'testing.com',
  'example-1.com',
  'example-2.com',
  'example-3.com',
  'mysite.com',
  'secure.endpoint.com'
]

test('docs examples use RFC2606-style placeholder domains', () => {
  for (const relativePath of files) {
    const fullPath = path.join(__dirname, '..', '..', relativePath)
    const text = fs.readFileSync(fullPath, 'utf8')

    for (const host of disallowedHosts) {
      assert.equal(
        text.includes(host),
        false,
        `${relativePath} still contains non-RFC2606 placeholder domain: ${host}`
      )
    }
  }
})
