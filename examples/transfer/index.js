const undici = require('../../')
const http = require('http')
const fs = require('fs')
const { promisify } = require('util')
const { pipeline, Readable } = require('stream')
const promisePipeline = promisify(pipeline)

const dummyUploadConsumer = (req, res) => {
  promisePipeline(req, fs.createWriteStream('a.jpg')).then(
    () => {
      console.log('✔️')
      res.end('ok')
    },
    (err) => res.end(err.message)
  )
}

async function run () {
  const server = http.createServer(dummyUploadConsumer)
  await promisify(server.listen.bind(server))(4000)

  // one request to warm things up
  const re = await undici.request(
    'https://avatars.githubusercontent.com/u/509375'
  )
  re.body.resume()
  await promisify(re.body.on.bind(re.body, 'end'))

  // 1. Use it like any other http request lib
  //    That doesn't seem like the way I'm supposed to use undici
  console.time('1a')
  const response = await undici.request(
    'https://avatars.githubusercontent.com/u/509375'
  )
  console.log(response.statusCode)
  const result = await undici.request('http://localhost:4000/', {
    method: 'POST',
    body: response.body
  })
  console.log(result.statusCode)
  console.timeEnd('1a')
  result.body.resume()

  // 2. Attempt something more idiomatic?
  //    I feel like I left a dangling readable end somewhere. A request-like method returning a Writable would work better than pipeline here
  console.time('2a')
  console.time('2b')
  await undici.stream(
    'https://avatars.githubusercontent.com/u/509375',
    {},
    ({ statusCode, headers }) => {
      console.log(statusCode)
      return undici.pipeline(
        'http://localhost:4000/',
        {
          method: 'POST'
        },
        ({ statusCode, headers, body }) => {
          console.log(statusCode)
          console.timeEnd('2a')
          return body
        }
      )
    }
  )
  console.timeEnd('2b')

  // 3. Is this more idiomatic??
  //    If authors intended this, I wouldn't have to kick it off with an empty stream
  console.time('3a')
  console.time('3b')
  await promisePipeline(
    new Readable({
      read () {
        this.push(null)
      }
    }),
    undici.pipeline(
      'https://avatars.githubusercontent.com/u/509375',
      { method: 'GET' },
      ({ statusCode, headers, body }) => {
        console.log(statusCode)
        return body
      }
    ),
    undici.pipeline(
      'http://localhost:4000/',
      {
        method: 'POST'
      },
      ({ statusCode, headers, body }) => {
        console.log(statusCode)
        console.timeEnd('3a')
        return body
      }
    )
  )
  console.timeEnd('3b')

  // 4. how about without the silly Readable?
  //    (await request).body is not super nice - a function returning readable and accepting a handler would work better
  console.time('4a')
  console.time('4b')
  await promisePipeline(
    (await undici.request('https://avatars.githubusercontent.com/u/509375'))
      .body,
    undici.pipeline(
      'http://localhost:4000/',
      {
        method: 'POST'
      },
      ({ statusCode, headers, body }) => {
        console.log(statusCode)
        console.timeEnd('4a')
        return body
      }
    )
  )
  console.timeEnd('4b')

  // terminate please
  server.close()
}

run()
