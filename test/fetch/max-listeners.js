'use strict'

const { setMaxListeners, getMaxListeners, defaultMaxListeners } = require('events')
const { test } = require('node:test')
const assert = require('node:assert')
const { fetch } = require('../..')

test('test max listeners', async (t) => {
    const controller = new AbortController();
    setMaxListeners(Infinity, controller.signal)
    let url = URL.createObjectURL(new Blob())
    for(let i=0;i<1600;i++)
        fetch(url, { signal: controller.signal })
    assert.strictEqual(getMaxListeners(controller.signal), Infinity);
});