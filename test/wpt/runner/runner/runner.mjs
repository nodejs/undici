import { deepStrictEqual } from 'node:assert'
import { EventEmitter, once } from 'node:events'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { parseMeta, handlePipes, normalizeName, colors } from './util.mjs'

const basePath = fileURLToPath(join(import.meta.url, '../../..'))
const testPath = join(basePath, 'tests')
const statusPath = join(basePath, 'status')

export class WPTRunner extends EventEmitter {
  /** @type {string} */
  #folderName

  /** @type {string} */
  #folderPath

  /** @type {string[]} */
  #files = []

  /** @type {string[]} */
  #initScripts = []

  /** @type {string} */
  #url

  /** @type {import('../../status/fetch.status.json')} */
  #status

  /** Tests that have expectedly failed mapped by file name */
  #statusOutput = {}

  #stats = {
    completed: 0,
    failed: 0,
    success: 0,
    expectedFailures: 0,
    skipped: 0
  }

  constructor (folder, url) {
    super()

    this.#folderName = folder
    this.#folderPath = join(testPath, folder)
    this.#files.push(...WPTRunner.walk(
      this.#folderPath,
      (file) => file.endsWith('.js')
    ))
    this.#status = JSON.parse(readFileSync(join(statusPath, `${folder}.status.json`)))
    this.#url = url

    if (this.#files.length === 0) {
      queueMicrotask(() => {
        this.emit('completion')
      })
    }
  }

  static walk (dir, fn) {
    const ini = new Set(readdirSync(dir))
    const files = new Set()

    while (ini.size !== 0) {
      for (const d of ini) {
        const path = resolve(dir, d)
        ini.delete(d) // remove from set
        const stats = statSync(path)

        if (stats.isDirectory()) {
          for (const f of readdirSync(path)) {
            ini.add(resolve(path, f))
          }
        } else if (stats.isFile() && fn(d)) {
          files.add(path)
        }
      }
    }

    return [...files].sort()
  }

  async run () {
    const workerPath = fileURLToPath(join(import.meta.url, '../worker.mjs'))
    /** @type {Set<Worker>} */
    const activeWorkers = new Set()
    let finishedFiles = 1
    let total = this.#files.length

    const files = this.#files.map((test) => {
      const code = test.includes('.sub.')
        ? handlePipes(readFileSync(test, 'utf-8'), this.#url)
        : readFileSync(test, 'utf-8')
      const meta = this.resolveMeta(code, test)

      if (meta.variant.length) {
        total += meta.variant.length - 1
      }

      return [test, code, meta]
    })

    for (const [test, code, meta] of files) {
      if (this.#status[basename(test)]?.skip) {
        this.#stats.skipped += 1

        console.log('='.repeat(96))
        console.log(colors(`[${finishedFiles}/${total}] SKIPPED - ${test}`, 'yellow'))
        console.log('='.repeat(96))

        finishedFiles++
        continue
      }

      const start = performance.now()

      for (const variant of meta.variant.length ? meta.variant : ['']) {
        const url = new URL(this.#url)
        if (variant) {
          url.search = variant
        }
        const worker = new Worker(workerPath, {
          workerData: {
            // Code to load before the test harness and tests.
            initScripts: this.#initScripts,
            // The test file.
            test: code,
            // Parsed META tag information
            meta,
            url: url.href,
            path: test
          }
        })

        activeWorkers.add(worker)
        // These values come directly from the web-platform-tests
        const timeout = meta.timeout === 'long' ? 60_000 : 10_000

        worker.on('message', (message) => {
          if (message.type === 'result') {
            this.handleIndividualTestCompletion(message, basename(test))
          } else if (message.type === 'completion') {
            this.handleTestCompletion(worker)
          }
        })

        try {
          activeWorkers.delete(worker)

          await once(worker, 'exit', {
            signal: AbortSignal.timeout(timeout)
          })

          console.log('='.repeat(96))
          console.log(colors(`[${finishedFiles}/${total}] PASSED - ${test}`, 'green'))
          if (variant) console.log('Variant:', variant)
          console.log(`Test took ${(performance.now() - start).toFixed(2)}ms`)
          console.log('='.repeat(96))

          finishedFiles++
        } catch (e) {
          console.log(`${test} timed out after ${timeout}ms`)
          throw e
        }
      }
    }

    this.handleRunnerCompletion()
  }

  /**
   * Called after a test has succeeded or failed.
   */
  handleIndividualTestCompletion (message, fileName) {
    const { fail, allowUnexpectedFailures, flaky } = this.#status[fileName] ?? this.#status

    if (message.type === 'result') {
      this.#stats.completed += 1

      if (message.result.status === 1) {
        this.#stats.failed += 1

        const name = normalizeName(message.result.name)

        if (flaky?.includes(name)) {
          this.#stats.expectedFailures += 1
        } else if (allowUnexpectedFailures || fail?.includes(name)) {
          if (!allowUnexpectedFailures) {
            this.#statusOutput[fileName] ??= []
            this.#statusOutput[fileName].push(name)
          }
          this.#stats.expectedFailures += 1
        } else {
          process.exitCode = 1
          console.error(message.result)
        }
      } else {
        this.#stats.success += 1
      }
    }
  }

  /**
   * Called after all the tests in a worker are completed.
   * @param {Worker} worker
   */
  handleTestCompletion (worker) {
    worker.terminate()
  }

  /**
   * Called after every test has completed.
   */
  handleRunnerCompletion () {
    const expectedFailuresObject = Object.keys(this.#status).reduce((a, b) => {
      if (Array.isArray(this.#status[b].fail)) {
        a[b] = [...this.#status[b].fail]
      }
      return a
    }, {})

    deepStrictEqual(
      this.#statusOutput,
      expectedFailuresObject
    )

    this.emit('completion')
    const { completed, failed, success, expectedFailures, skipped } = this.#stats
    console.log(
      `[${this.#folderName}]: ` +
      `Completed: ${completed}, failed: ${failed}, success: ${success}, ` +
      `expected failures: ${expectedFailures}, ` +
      `unexpected failures: ${failed - expectedFailures}, ` +
      `skipped: ${skipped}`
    )
  }

  addInitScript (code) {
    this.#initScripts.push(code)
  }

  /**
   * Parses META tags and resolves any script file paths.
   * @param {string} code
   * @param {string} path The absolute path of the test
   */
  resolveMeta (code, path) {
    const meta = parseMeta(code)
    const scripts = meta.scripts.map((filePath) => {
      let content = ''

      if (filePath === '/resources/WebIDLParser.js') {
        // See https://github.com/web-platform-tests/wpt/pull/731
        return readFileSync(join(testPath, '/resources/webidl2/lib/webidl2.js'), 'utf-8')
      } else if (isAbsolute(filePath)) {
        content = readFileSync(join(testPath, filePath), 'utf-8')
      } else {
        content = readFileSync(resolve(path, '..', filePath), 'utf-8')
      }

      // If the file has any built-in pipes.
      if (filePath.includes('.sub.')) {
        content = handlePipes(content, this.#url)
      }

      return content
    })

    return {
      ...meta,
      resourcePaths: meta.scripts,
      scripts
    }
  }
}
