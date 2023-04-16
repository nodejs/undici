'use strict'

const { kConstruct } = require('./symbols')
const { Cache } = require('./cache')
const { tmpdir, toCacheName } = require('./util')
const { webidl } = require('../fetch/webidl')
const {
  promises: {
    rmdir,
    mkdir,
    readdir,
    writeFile,
    readFile
  },
  existsSync,
  mkdirSync
} = require('fs')
const { join } = require('path')
const assert = require('assert')

class CacheStorage {
  constructor () {
    if (arguments[0] !== kConstruct) {
      webidl.illegalConstructor()
    }

    if (!existsSync(tmpdir)) {
      mkdirSync(tmpdir)
    }
  }

  async match (request, options = {}) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.match' })

    request = webidl.converters.RequestInfo(request)
    options = webidl.converters.CacheQueryOptions(options)
  }

  async has (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.has' })

    cacheName = toCacheName(cacheName)

    return existsSync(join(tmpdir, cacheName))
  }

  async open (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.open' })

    const hashedName = toCacheName(cacheName)
    const path = join(tmpdir, hashedName)

    if (!existsSync(path)) {
      await mkdir(path)
      await writeFile(
        join(path, `${hashedName}.json`),
        JSON.stringify({ cacheName })
      )
    }

    return new Cache(kConstruct, hashedName)
  }

  async delete (cacheName) {
    webidl.brandCheck(this, CacheStorage)
    webidl.argumentLengthCheck(arguments, 1, { header: 'CacheStorage.delete' })

    cacheName = toCacheName(cacheName)

    return await rmdir(join(tmpdir, cacheName))
      .then(() => true)
      .catch(() => false)
  }

  async keys () {
    webidl.brandCheck(this, CacheStorage)

    const dirs = await readdir(tmpdir, { withFileTypes: true })
    const promises = []

    for (const dir of dirs) {
      assert(dir.isDirectory(), `${dir.name} is not a directory`)

      const jsonPath = join(tmpdir, dir.name, `${dir.name}.json`)

      promises.push(readFile(jsonPath, 'utf-8').then(cache => JSON.parse(cache).cacheName))
    }

    return Promise.all(promises)
  }
}

module.exports = {
  CacheStorage
}
