'use strict'

const { fetch } = require('../..')
const { test } = require('tap')

/* global AbortController */
const controller = new AbortController()

test('abort fetch', (t) => {
  fetch(
    'https://speed.hetzner.de/100MB.bin', {
      signal: controller.signal
    }).then(response => {
    (async () => {
      try {
        await response.text()
      } catch (err) {
        t.equal(err.name, 'AbortError')
      }
      t.end()
    })()
    controller.abort()
  })
})
