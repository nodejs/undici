const { RoundRobinPool } = require('./index.js')
const { createServer } = require('node:http')

const server = createServer((req, res) => {
  console.log('Request received')
  res.writeHead(200)
  res.end('hello')
})

server.listen(0, async () => {
  const port = server.address().port
  console.log(`Server listening on port ${port}`)

  const pool = new RoundRobinPool(`http://localhost:${port}`, { connections: 2 })

  try {
    console.log('Making request 1...')
    const { body: body1 } = await pool.request({ path: '/', method: 'GET' })
    await body1.text()
    console.log('Request 1 complete')

    console.log('Making request 2...')
    const { body: body2 } = await pool.request({ path: '/', method: 'GET' })
    await body2.text()
    console.log('Request 2 complete')

    console.log('Closing pool...')
    await pool.close()
    console.log('Pool closed')

    console.log('Closing server...')
    server.close(() => {
      console.log('Server closed')
      throw new Error('Test completed')
    })
  } catch (err) {
    console.error('Error:', err)
    throw new Error('Test failed')
  }
})
