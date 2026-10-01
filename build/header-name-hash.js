'use strict'

// Finds HEADER_NAME_HASH_K and HEADER_NAME_HASH_M in lib/core/util.js: a hash
// that places every name in wellknownResponseHeaderNames in its own slot among
// 256 slots, so stringifyHTTPHeader needs one compare to tell a well-known name.
//
// It tries K = 3, 5, 7, ... and, for each, every odd M, and prints the first
// pair that works: the smallest M for the smallest K, whatever the number of
// threads. A pair stops working when names are added, and the chance that one
// places n names apart falls off like e^(-n²/512), so keep the list to about
// 110 names.
//
//   node build/header-name-hash.js

const { availableParallelism } = require('node:os')
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads')

if (isMainThread) {
  const { wellknownResponseHeaderNames } = require('../lib/core/constants.js')
  const threads = Math.min(availableParallelism(), 4)
  const chunk = Math.ceil(2 ** 31 / threads)

  const search = async () => {
    for (let k = 3; ; k += 2) {
      const hashes = Int32Array.from(wellknownResponseHeaderNames, (name) => {
        let hash = 0
        for (let i = 0; i < name.length; i++) {
          hash = Math.imul(hash, k) ^ name.charCodeAt(i)
        }
        return hash
      })
      if (new Set(hashes).size === hashes.length) {
        const found = await Promise.all(Array.from({ length: threads }, (_, t) => new Promise((resolve, reject) => {
          const lo = t * chunk
          new Worker(__filename, { workerData: { hashes, lo, hi: Math.min(lo + chunk, 2 ** 31) } })
            .once('message', resolve)
            .once('error', reject)
        })))
        const m = found.find((m) => m !== 0)
        if (m !== undefined) {
          console.log(`HEADER_NAME_HASH_K = ${k}, HEADER_NAME_HASH_M = 0x${m.toString(16)}`)
          return
        }
      }
      console.error(`K = ${k}: no M`)
    }
  }
  search()
} else {
  // M = 2j + 1 for j in [lo, hi): post the first that places every hash in
  // its own slot, or 0.
  const { hashes, lo, hi } = workerData
  const seen = new Uint32Array(256)
  let found = 0
  for (let j = lo; j < hi && found === 0; j++) {
    const m = 2 * j + 1
    let i = 0
    while (i < hashes.length) {
      const slot = Math.imul(hashes[i], m) >>> 24
      if (seen[slot] === j + 1) {
        break
      }
      seen[slot] = j + 1
      i++
    }
    if (i === hashes.length) {
      found = m
    }
  }
  parentPort.postMessage(found)
}
