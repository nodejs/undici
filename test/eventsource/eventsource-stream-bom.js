'use strict'

const assert = require('node:assert')
const { test, describe } = require('node:test')
const { EventSourceStream } = require('../../lib/web/eventsource/eventsource-stream')

describe('EventSourceStream - handle BOM', () => {
  test('Remove BOM from the beginning of the stream. 1 byte chunks', () => {
    const dataField = 'data: Hello'
    const content = Buffer.from(`\uFEFF${dataField}`, 'utf8')

    const stream = new EventSourceStream()

    stream.parseLine = function (line) {
      assert.strictEqual(line.byteLength, dataField.length)
      assert.strictEqual(line.toString(), dataField)
    }

    for (let i = 0; i < content.length; i++) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Remove BOM from the beginning of the stream. 2 byte chunks', () => {
    const dataField = 'data: Hello'
    const content = Buffer.from(`\uFEFF${dataField}`, 'utf8')

    const stream = new EventSourceStream()

    stream.parseLine = function (line) {
      assert.strictEqual(line.byteLength, dataField.length)
      assert.strictEqual(line.toString(), dataField)
    }

    for (let i = 0; i < content.length; i += 2) {
      stream.write(Buffer.from([content[i], content[i + 1]]))
    }
  })

  test('Remove BOM from the beginning of the stream. 3 byte chunks', () => {
    const dataField = 'data: Hello'
    const content = Buffer.from(`\uFEFF${dataField}`, 'utf8')

    const stream = new EventSourceStream()

    stream.parseLine = function (line) {
      assert.strictEqual(line.byteLength, dataField.length)
      assert.strictEqual(line.toString(), dataField)
    }

    for (let i = 0; i < content.length; i += 3) {
      stream.write(Buffer.from([content[i], content[i + 1], content[i + 2]]))
    }
  })

  test('Remove BOM from the beginning of the stream. 4 byte chunks', () => {
    const dataField = 'data: Hello'
    const content = Buffer.from(`\uFEFF${dataField}`, 'utf8')

    const stream = new EventSourceStream()

    stream.parseLine = function (line) {
      assert.strictEqual(line.byteLength, dataField.length)
      assert.strictEqual(line.toString(), dataField)
    }

    for (let i = 0; i < content.length; i += 4) {
      stream.write(Buffer.from([content[i], content[i + 1], content[i + 2], content[i + 3]]))
    }
  })

  test('Not containing BOM from the beginning of the stream. 1 byte chunks', () => {
    const dataField = 'data: Hello'
    const content = Buffer.from(`${dataField}`, 'utf8')

    const stream = new EventSourceStream()

    stream.parseLine = function (line) {
      assert.strictEqual(line.byteLength, dataField.length)
      assert.strictEqual(line.toString(), dataField)
    }

    for (let i = 0; i < content.length; i += 1) {
      stream.write(Buffer.from([content[i]]))
    }
  })

  test('Not containing BOM from the beginning of the stream. 2 byte chunks', () => {
    const dataField = 'data: Hello'
    const content = Buffer.from(`${dataField}`, 'utf8')

    const stream = new EventSourceStream()

    stream.parseLine = function (line) {
      assert.strictEqual(line.byteLength, dataField.length)
      assert.strictEqual(line.toString(), dataField)
    }

    for (let i = 0; i < content.length; i += 2) {
      stream.write(Buffer.from([content[i], content[i + 1]]))
    }
  })

  test('Not containing BOM from the beginning of the stream. 3 byte chunks', () => {
    const dataField = 'data: Hello'
    const content = Buffer.from(`${dataField}`, 'utf8')

    const stream = new EventSourceStream()

    stream.parseLine = function (line) {
      assert.strictEqual(line.byteLength, dataField.length)
      assert.strictEqual(line.toString(), dataField)
    }

    for (let i = 0; i < content.length; i += 3) {
      stream.write(Buffer.from([content[i], content[i + 1], content[i + 2]]))
    }
  })

  test('Not containing BOM from the beginning of the stream. 4 byte chunks', () => {
    const dataField = 'data: Hello'
    const content = Buffer.from(`${dataField}`, 'utf8')

    const stream = new EventSourceStream()

    stream.parseLine = function (line) {
      assert.strictEqual(line.byteLength, dataField.length)
      assert.strictEqual(line.toString(), dataField)
    }

    for (let i = 0; i < content.length; i += 4) {
      stream.write(Buffer.from([content[i], content[i + 1], content[i + 2], content[i + 3]]))
    }
  })
})
