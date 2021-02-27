const { Worker } = require('worker_threads')
const path = require('path')

module.exports = class HTTPParser {
  constructor ({ maxHeaderSize }) {
    this.worker = new Worker(path.join(__dirname, 'parser-worker.js'), {
      workerData: {
        maxHeaderSize
      }
    })
      .on('message', ({ action, args }) => {
        this[action](...args)
      })
      .on('error', (err) => {
        console.error('err', err)
        throw err
        // TODO
      })
      .on('exit', () => {
        // console.error('exit')
        // TODO
      })
  }

  execute (buf) {
    this.worker.postMessage(buf, [buf.buffer])
  }

  destroy () {
    this.worker.terminate()
  }
}
