'use strict'

const { createServer } = require('node:http')
const { LOOPBACK_HOST } = require('./node-http')

const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')

  await sendInDelayedChunks(res, 'Hello World', 125)
  res.end()
})

async function sendInDelayedChunks (res, payload, delay) {
  const chunks = payload.split('')

  for (const chunk of chunks) {
    await new Promise(resolve => setTimeout(resolve, delay))

    res.write(chunk)
  }
}

server.listen(0, LOOPBACK_HOST, () => {
  if (process.send) {
    process.send(`http://${LOOPBACK_HOST}:${server.address().port}/`)
  } else {
    console.log(`http://${LOOPBACK_HOST}:${server.address().port}/`)
  }
})
