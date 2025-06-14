import { Worker, isMainThread, parentPort, threadId } from 'node:worker_threads'
import { cpus } from 'node:os'
import url from 'node:url'
import uws from 'uWebSockets.js'

const __filename = url.fileURLToPath(import.meta.url)

const app = uws.App()

if (isMainThread) {
  for (let i = cpus().length - 1; i >= 0; --i) {
    new Worker(__filename).on('message', (workerAppDescriptor) => {
      app.addChildAppDescriptor(workerAppDescriptor)
    })
  }
} else {
  app
    .ws('/*', {
      compression: uws.DISABLED,
      maxPayloadLength: 1024 * 1024 * 1024,
      maxBackpressure: 1 * 1024 * 1024,
      idleTimeout: 60,
      message: (ws, message, isBinary) => {
        /* Here we echo the message back, using compression if available */
        const ok = ws.send(message, isBinary) // eslint-disable-line
      }
    })
    .get('/*', (res, req) => {
      /* It does Http as well */
      res
        .writeStatus('200 OK')
        .end('Hello there!')
    })

  parentPort.postMessage(app.getDescriptor())
}

app.listen(8080, (listenSocket) => {
  if (listenSocket) {
    if (threadId === 0) {
      console.log('Listening to port 8080')
    } else {
      console.log(`Listening to port 8080 from thread ${threadId}`)
    }
  }
})
