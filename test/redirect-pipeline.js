'use strict'

const t = require('tap')
const { pipeline: undiciPipeline, Agent, redirectPoolFactory } = require('..')
const { Readable, Writable, pipeline: streamPipelineCb } = require('stream')
const { promisify } = require('util')

const streamPipeline = promisify(streamPipelineCb)

t.test('should not allow use of RedirectPool with pipelines', async t => {
  t.plan(1)

  const body = []

  try {
    await streamPipeline(
      new Readable({
        read () {
          this.push(Buffer.from('REQUEST'))
          this.push(null)
        }
      }),
      undiciPipeline(
        'http://localhost:0',
        { agent: new Agent({ factory: redirectPoolFactory }) },
        ({ statusCode, headers, body }) => {
          t.fail('Pipelined')

          return body
        }
      ),
      new Writable({
        write (chunk, _, callback) {
          body.push(chunk.toString())
          callback()
        },
        final (callback) {
          callback()
        }
      })
    )

    throw new Error('Did not throw')
  } catch (error) {
    t.strictEqual(error.message, 'RedirectPool cannot be used with pipeline')
  }
})
