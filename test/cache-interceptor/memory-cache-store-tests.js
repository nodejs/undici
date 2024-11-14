'use strict'

const MemoryCacheStore = require('../../lib/cache/memory-cache-store')
const { cacheStoreTests } = require('./cache-store-test-utils.js')

cacheStoreTests(MemoryCacheStore)
