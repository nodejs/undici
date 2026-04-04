'use strict'

const { strictEqual } = require('node:assert')
const { test } = require('node:test')
const { getPreviousRelease } = require('../scripts/release')

test('getPreviousRelease uses the latest release from the current major line', () => {
  const previousRelease = getPreviousRelease({
    versionTag: 'v8.0.1',
    releases: [
      { tag_name: 'v8.0.0' },
      { tag_name: 'v7.16.0' }
    ]
  })

  strictEqual(previousRelease?.tag_name, 'v8.0.0')
})

test('getPreviousRelease ignores the current version tag', () => {
  const previousRelease = getPreviousRelease({
    versionTag: 'v8.0.1',
    releases: [
      { tag_name: 'v8.0.1' },
      { tag_name: 'v8.0.0' },
      { tag_name: 'v7.16.0' }
    ]
  })

  strictEqual(previousRelease?.tag_name, 'v8.0.0')
})

test('getPreviousRelease returns undefined when the current major has no previous releases', () => {
  const previousRelease = getPreviousRelease({
    versionTag: 'v8.0.0',
    releases: [
      { tag_name: 'v7.16.0' }
    ]
  })

  strictEqual(previousRelease, undefined)
})
