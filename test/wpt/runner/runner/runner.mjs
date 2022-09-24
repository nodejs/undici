import { EventEmitter } from 'node:events'
import { readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Worker } from 'node:worker_threads'

const testPath = fileURLToPath(join(import.meta.url, '../../../tests'))

export class WPTRunner extends EventEmitter {
  /** @type {string} */
  #folderPath

  /** @type {string[]} */
  #files = []

  /** @type {string[]} */
  #initScripts = []

  /** @type {string} */
  #url

  constructor (folder, url) {
    super()

    this.#folderPath = join(testPath, folder)
    this.#files.push(...WPTRunner.walk(this.#folderPath, () => true))
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
      if (message.result?.status === 1) {
        process.exitCode = 1
        console.log({ message })
      } else if (message.type === 'completion') {
        this.emit('completion')
      }
    })
  }

  addInitScript (code) {
    this.#initScripts.push(code)
  }
}
