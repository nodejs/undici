import { EventEmitter, once } from 'node:events'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'
import { parseMeta, resolveSymLink } from './util.mjs'

const basePath = fileURLToPath(join(import.meta.url, '../../..'))
const testPath = join(basePath, 'tests')
const statusPath = join(basePath, 'status')

export class WPTRunner extends EventEmitter {
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

  #stats = {
    completed: 0,
    failed: 0,
    success: 0,
    expectedFailures: 0
  }

  constructor (folder, url) {
    super()

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

    return [...files]
  }

  async run () {
    const workerPath = fileURLToPath(join(import.meta.url, '../worker.mjs'))

    for (const test of this.#files) {
      const code = readFileSync(test, 'utf-8')
      const worker = new Worker(workerPath, {
        workerData: {
          // Code to load before the test harness and tests.
          initScripts: this.#initScripts,
          // The test file.
          test: code,
          // Parsed META tag information
          meta: this.resolveMeta(code, test),
          url: this.#url,
          path: test
        }
      })

      worker.on('message', (message) => {
        if (message.type === 'result') {
          this.handleIndividualTestCompletion(message, basename(test))
        } else if (message.type === 'completion') {
          this.handleTestCompletion(worker)
        }
      })

      await once(worker, 'exit')
    }

    this.emit('completion')
    const { completed, failed, success, expectedFailures } = this.#stats
    console.log(
      `Completed: ${completed}, failed: ${failed}, success: ${success}, ` +
      `expected failures: ${expectedFailures}, ` +
      `unexpected failures: ${failed - expectedFailures}`
    )
  }

  /**
   * Called after a test has succeeded or failed.
   */
  handleIndividualTestCompletion (message, fileName) {
    const { fail } = this.#status[fileName] ?? {}

    if (message.type === 'result') {
      this.#stats.completed += 1

      if (message.result.status === 1) {
        this.#stats.failed += 1

        if (fail && fail.includes(message.result.name)) {
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
    const scripts = meta.scripts.map((script) => {
      if (script === '/resources/WebIDLParser.js') {
        // See https://github.com/web-platform-tests/wpt/pull/731
        return resolveSymLink(join(testPath, script))
      } else if (isAbsolute(script)) {
        return readFileSync(join(testPath, script), 'utf-8')
      }

      return readFileSync(resolve(path, '..', script), 'utf-8')
    })

    return {
      ...meta,
      scripts
    }
  }
}
