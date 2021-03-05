class TLSSessionCache {
  constructor (opts) {
    this.maxSize = opts && opts.maxSize ? opts.maxSize : 10

    this.cache = WeakMap()
    this.sessions = []
  }

  set (client, session) {
    if (this.cache.has(client)) {
      this.cache.set(client, session)
    }
    this.cache.set(client, session)
    this.resize()
  }

  delete (client) {
    this.cache.delete(client)
  }

  resize () {
    while (this.cache.size > this.maxSize) {
      // remove the oldest entry from the map
      this.cache.delete(this.cache.keys().next().value)
    }
  }
}

module.exports = TLSSessionCache
