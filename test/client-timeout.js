'use strict'

const { test } = require('tap')
const { Client, errors } = require('..')
const { createServer } = require('http')
// const { Readable } = require('stream')
// const FakeTimers = require('@sinonjs/fake-timers')

test('refresh timeout on pause', (t) => {
  t.plan(1)

  const server = createServer((req, res) => {
    res.flushHeaders()
  })
  t.teardown(server.close.bind(server))

  server.listen(0, () => {
    const client = new Client(`http://localhost:${server.address().port}`, {
      bodyTimeout: 1500
    })
    t.teardown(client.destroy.bind(client))

    client.dispatch({
      path: '/',
      method: 'GET'
    }, {
      onConnect () {
      },
      onHeaders (statusCode, headers, resume) {
        setTimeout(() => {
          resume()
        }, 3000)
        return false
      },
      onData () {

      },
      onComplete () {

      },
      onError (err) {
        t.type(err, errors.BodyTimeoutError)
      }
    })
  })
})

// test('start headers timeout after request body', (t) => {
//   t.plan(2)

//   const clock = FakeTimers.install()
//   t.teardown(clock.uninstall.bind(clock))

//   const server = createServer((req, res) => {
//   })
//   t.teardown(server.close.bind(server))

//   server.listen(0, () => {
//     const client = new Client(`http://localhost:${server.address().port}`, {
//       bodyTimeout: 0,
//       headersTimeout: 10000
//     })
//     t.teardown(client.destroy.bind(client))

//     const body = new Readable({ read () {} })
//     client.dispatch({
//       path: '/',
//       body,
//       method: 'GET'
//     }, {
//       onConnect () {
//         process.nextTick(() => {
//           clock.tick(20000)
//         })
//         queueMicrotask(() => {
//           body.push(null)
//           body.on('end', () => {
//             clock.tick(20000)
//           })
//         })
//       },
//       onHeaders (statusCode, headers, resume) {
//       },
//       onData () {

//       },
//       onComplete () {

//       },
//       onError (err) {
//         t.equal(body.readableEnded, true)
//         t.type(err, errors.HeadersTimeoutError)
//       }
//     })
//   })
// })

// test('start headers timeout after async iterator request body', (t) => {
//   t.plan(1)

//   const clock = FakeTimers.install()
//   t.teardown(clock.uninstall.bind(clock))

//   const server = createServer((req, res) => {
//   })
//   t.teardown(server.close.bind(server))

//   server.listen(0, () => {
//     const client = new Client(`http://localhost:${server.address().port}`, {
//       bodyTimeout: 0,
//       headersTimeout: 10000
//     })
//     t.teardown(client.destroy.bind(client))
//     let res
//     const body = (async function * () {
//       await new Promise((resolve) => { res = resolve })
//       process.nextTick(() => {
//         clock.tick(20000)
//       })
//     })()
//     client.dispatch({
//       path: '/',
//       body,
//       method: 'GET'
//     }, {
//       onConnect () {
//         process.nextTick(() => {
//           clock.tick(20000)
//         })
//         queueMicrotask(() => {
//           res()
//         })
//       },
//       onHeaders (statusCode, headers, resume) {
//       },
//       onData () {

//       },
//       onComplete () {

//       },
//       onError (err) {
//         t.type(err, errors.HeadersTimeoutError)
//       }
//     })
//   })
// })

// test('parser resume with no body timeout', (t) => {
//   t.plan(1)

//   const server = createServer((req, res) => {
//     res.end('asd')
//   })
//   t.teardown(server.close.bind(server))

//   server.listen(0, () => {
//     const client = new Client(`http://localhost:${server.address().port}`, {
//       bodyTimeout: 0
//     })
//     t.teardown(client.destroy.bind(client))

//     client.dispatch({
//       path: '/',
//       method: 'GET'
//     }, {
//       onConnect () {
//       },
//       onHeaders (statusCode, headers, resume) {
//         setTimeout(resume, 2000)
//         return false
//       },
//       onData () {

//       },
//       onComplete () {
//         t.pass()
//       },
//       onError (err) {
//         t.error(err)
//       }
//     })
//   })
// })
