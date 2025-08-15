// @ts-check

'use strict'

class Info {
  /** @type {string} */
  #name
  /** @type {bigint} */
  #current
  /** @type {bigint} */
  #finish
  /** @type {(...args: any[]) => any} */
  #callback
  /** @type {boolean} */
  #finalized = false

  /**
   * @param {string} name
   * @param {(...args: any[]) => any} callback
   */
  constructor (name, callback) {
    this.#name = name
    this.#callback = callback
  }

  get name () {
    return this.#name
  }

  start () {
    if (this.#finalized) {
      throw new TypeError('called after finished.')
    }
    this.#current = process.hrtime.bigint()
  }

  end () {
    if (this.#finalized) {
      throw new TypeError('called after finished.')
    }
    this.#finish = process.hrtime.bigint()
    this.#finalized = true
    this.#callback()
  }

  diff () {
    return Number(this.#finish - this.#current)
  }
}

/**
 * @typedef BenchMarkHandler
 * @type {(ev: { name: string; start(): void; end(): void; }) => any}
 */

/**
 * @param {Record<string, BenchMarkHandler>} experiments
 * @param {{ minSamples?: number; maxSamples?: number }} [options]
 * @returns {Promise<{ name: string; average: number; samples: number; fn: BenchMarkHandler; iterationPerSecond: number; min: number; max: number }[]>}
 */
async function bench (experiments, options = {}) {
  const names = Object.keys(experiments)

  /** @type {{ name: string; average: number; samples: number; fn: BenchMarkHandler; iterationPerSecond: number; min: number; max: number }[]} */
  const results = []

  async function waitMaybePromiseLike (p) {
    if (
      (typeof p === 'object' || typeof p === 'function') &&
      p !== null &&
      typeof p.then === 'function'
    ) {
      await p
    }
  }

  for (let i = 0; i < names.length; ++i) {
    const name = names[i]
    const fn = experiments[name]
    const samples = []

    for (let i = 0; i < 8; ++i) {
      // warmup
      await new Promise((resolve, reject) => {
        const info = new Info(name, resolve)

        try {
          const p = fn(info)

          waitMaybePromiseLike(p).catch((err) => reject(err))
        } catch (err) {
          reject(err)
        }
      })
    }

    let timing = 0
    const minSamples = options.minSamples ?? 128

    for (let j = 0; (j < minSamples || timing < 800_000_000) && (typeof options.maxSamples === 'number' ? options.maxSamples > j : true); ++j) {
      let resolve = (value) => {}
      let reject = (reason) => {}
      const promise = new Promise(
        (_resolve, _reject) => { resolve = _resolve; reject = _reject }
      )

      const info = new Info(name, resolve)

      try {
        const p = fn(info)

        await waitMaybePromiseLike(p)
      } catch (err) {
        reject(err)
      }

      await promise

      samples.push({ time: info.diff() })

      timing += info.diff()
    }

    const average =
      samples.map((v) => v.time).reduce((a, b) => a + b, 0) / samples.length

    results.push({
      name: names[i],
      average,
      samples: samples.length,
      fn,
      iterationPerSecond: 1e9 / average,
      min: samples.reduce((a, acc) => Math.min(a, acc.time), samples[0].time),
      max: samples.reduce((a, acc) => Math.max(a, acc.time), samples[0].time)
    })
  }

  return results
}

module.exports = { bench }
