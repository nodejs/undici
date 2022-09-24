import { EventEmitter } from 'node:events'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

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
    this.#files.push(...WPTRunner.walk(this.#folderPath, () => true))
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

  run () {
    const workerPath = fileURLToPath(join(import.meta.url, '../worker.mjs'))

    const worker = new Worker(workerPath, {
      workerData: {
        initScripts: this.#initScripts,
        paths: this.#files,
        url: this.#url
      }
    })

    worker.on('message', (message) => {
      if (message.type === 'result') {
        this.handleTestCompletion(message)
      } else if (message.type === 'completion') {
        this.emit('completion')
        const { completed, failed, success, expectedFailures } = this.#stats
        console.log(
          `Completed: ${completed}, failed: ${failed}, success: ${success}, ` +
          `expected failures: ${expectedFailures}, ` +
          `unexpected failures: ${failed - expectedFailures}`
        )
      }
    })
  }

  handleTestCompletion (message) {
    if (message.type === 'result') {
      this.#stats.completed += 1

      if (message.result.status === 1) {
        this.#stats.failed += 1
        this.onFail(message)
      } else {
        this.#stats.success += 1
      }
    }
  }

  onFail ({ result }) {
    const { name } = result

    if (this.#status.fail.includes(name)) {
      this.#stats.expectedFailures += 1
    } else {
      process.exitCode = 1
      console.error(result)
    }
  }

  addInitScript (code) {
    this.#initScripts.push(code)
  }
}
