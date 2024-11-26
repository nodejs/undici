'use strict'

import { parentPort } from 'node:worker_threads'

await import('../fixtures/cache-tests/test-engine/server/server.mjs')
parentPort.postMessage('listening')
