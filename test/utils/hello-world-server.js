'use strict'

const { createServer } = require('node:http')
const hostname = '127.0.0.1'

const server = createServer({ joinDuplicateHeaders: true }, async (req, res) => {
  res.statusCode = 200
  res.setHeader('Content-Type', 'text/plain')

  const query = new URL(req.url, 'http://localhost').searchParams

  await sendInDelayedChunks(res, 'Hello World', query.get('delay') || 125)
  res.end()
})

async function sendInDelayedChunks (res, payload, delay) {
  const chunks = payload.split('')

  for (const chunk of chunks) {
    await new Promise(resolve => setTimeout(resolve, delay))

    res.write(chunk)
  }
}

server.listen(0, hostname, () => {
  if (process.send) {
    process.send(`http://${hostname}:${server.address().port}/`)
  } else {
    console.log(`http://${hostname}:${server.address().port}/`)
  }
})
