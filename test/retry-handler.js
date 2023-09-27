'use strict'

const { getLocal } = require('mockttp')
const tap = require('tap')

const { RetryHandler, Client } = require('..')

tap.plan(1)

tap.test('Should retry on allowed status code', async t => {
  let counter = 0
  let res
  const chunks = []
  const server = getLocal()
  const dispatchOptions = {
    method: 'GET',
    path: '/',
    headers: {
      'content-type': 'application/json'
    }
  }
  const promise = new Promise((resolve) => {
    res = resolve
  })

  await server.start()

  const client = new Client(`http://localhost:${server.port}`)
  const handler = new RetryHandler(
    dispatchOptions,
    {
      dispatch: client.dispatch.bind(client),
      handler: {
        onConnect () {
          t.pass()
        },
        onBodySent () {
          t.pass()
        },
        onHeaders (status, _rawHeaders, resume, _statusMessage) {
          t.equal(status, 200)
          resume()
        },
        onData (chunk) {
          chunks.push(chunk)
          return true
        },
        onComplete () {
          t.equal(Buffer.concat(chunks).toString('utf-8'), 'hello world!')
          t.equal(counter, 2)
          res()
        },
        onError () {
          t.fail()
        }
      }
    },
    {
      retry: () => {
        counter++
        return 500
      }
    }
  )

  t.plan(6)
  t.teardown(async () => {
    await client.close()
    await server.stop()
  })

  await server.forAnyRequest().thenCloseConnection()
  await server.forAnyRequest().thenReply(500, 'Internal Server Error')
  await server.forAnyRequest().thenReply(200, 'hello world!')

  client.dispatch(
    {
      method: 'GET',
      path: '/',
      headers: {
        'content-type': 'application/json'
      }
    },
    handler
  )

  await promise
})
