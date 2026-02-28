'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { test } = require('node:test')
const {
  parseAddress,
  parseIPv6,
  buildAddressBuffer,
  parseResponseAddress,
  createReplyError
} = require('../lib/core/socks5-utils')
const { InvalidArgumentError } = require('../lib/core/errors')

test('parseAddress - IPv4', async (t) => {
  const p = tspl(t, { plan: 3 })

  const result = parseAddress('192.168.1.1')
  p.equal(result.type, 0x01, 'should return IPv4 type')
  p.equal(result.buffer.length, 4, 'should return 4-byte buffer')
  p.deepEqual(Array.from(result.buffer), [192, 168, 1, 1], 'should parse IPv4 correctly')

  await p.completed
})

test('parseAddress - IPv6', async (t) => {
  const p = tspl(t, { plan: 2 })

  const result = parseAddress('2001:db8::1')
  p.equal(result.type, 0x04, 'should return IPv6 type')
  p.equal(result.buffer.length, 16, 'should return 16-byte buffer')

  await p.completed
})

test('parseAddress - Domain', async (t) => {
  const p = tspl(t, { plan: 4 })

  const result = parseAddress('example.com')
  p.equal(result.type, 0x03, 'should return domain type')
  p.equal(result.buffer[0], 11, 'should have correct length byte')
  p.equal(result.buffer.subarray(1).toString(), 'example.com', 'should contain domain name')

  // Test domain too long
  const longDomain = 'a'.repeat(256)
  p.throws(() => parseAddress(longDomain), InvalidArgumentError, 'should throw for domain > 255 bytes')

  await p.completed
})

test('parseIPv6', async (t) => {
  const p = tspl(t, { plan: 3 })

  // Test full IPv6
  const buffer1 = parseIPv6('2001:0db8:0000:0042:0000:8a2e:0370:7334')
  p.equal(buffer1.length, 16, 'should return 16-byte buffer')

  // Test compressed IPv6
  const buffer2 = parseIPv6('2001:db8::1')
  p.equal(buffer2.length, 16, 'should return 16-byte buffer for compressed')

  // Test loopback
  const buffer3 = parseIPv6('::1')
  p.equal(buffer3.length, 16, 'should return 16-byte buffer for loopback')

  await p.completed
})

test('buildAddressBuffer', async (t) => {
  const p = tspl(t, { plan: 5 })

  // IPv4 address
  const ipv4Buffer = buildAddressBuffer(0x01, Buffer.from([192, 168, 1, 1]), 80)
  p.equal(ipv4Buffer[0], 0x01, 'should have IPv4 type')
  p.deepEqual(Array.from(ipv4Buffer.subarray(1, 5)), [192, 168, 1, 1], 'should have IPv4 address')
  p.equal(ipv4Buffer.readUInt16BE(5), 80, 'should have correct port')

  // Domain address
  const domainBuffer = Buffer.concat([Buffer.from([11]), Buffer.from('example.com')])
  const result = buildAddressBuffer(0x03, domainBuffer, 443)
  p.equal(result[0], 0x03, 'should have domain type')
  p.equal(result.readUInt16BE(result.length - 2), 443, 'should have correct port')

  await p.completed
})

test('parseResponseAddress - IPv4', async (t) => {
  const p = tspl(t, { plan: 4 })

  const buffer = Buffer.from([
    0x01, // IPv4 type
    192, 168, 1, 1, // IP address
    0x00, 0x50 // Port 80
  ])

  const result = parseResponseAddress(buffer)
  p.equal(result.address, '192.168.1.1', 'should parse IPv4 address')
  p.equal(result.port, 80, 'should parse port')
  p.equal(result.bytesRead, 7, 'should read 7 bytes')

  // Test with offset
  const bufferWithOffset = Buffer.concat([Buffer.from([0, 0]), buffer])
  const resultWithOffset = parseResponseAddress(bufferWithOffset, 2)
  p.equal(resultWithOffset.address, '192.168.1.1', 'should parse with offset')

  await p.completed
})

test('parseResponseAddress - Domain', async (t) => {
  const p = tspl(t, { plan: 3 })

  const buffer = Buffer.from([
    0x03, // Domain type
    11, // Length
    ...Buffer.from('example.com'),
    0x01, 0xBB // Port 443
  ])

  const result = parseResponseAddress(buffer)
  p.equal(result.address, 'example.com', 'should parse domain')
  p.equal(result.port, 443, 'should parse port')
  p.equal(result.bytesRead, 15, 'should read correct bytes')

  await p.completed
})

test('parseResponseAddress - IPv6', async (t) => {
  const p = tspl(t, { plan: 3 })

  const buffer = Buffer.alloc(19)
  buffer[0] = 0x04 // IPv6 type
  // Simple IPv6 address (all zeros except last byte)
  buffer[17] = 1
  buffer[17] = 0x00
  buffer[18] = 0x50 // Port 80

  const result = parseResponseAddress(buffer)
  p.match(result.address, /:/, 'should return IPv6 format')
  p.equal(result.port, 80, 'should parse port')
  p.equal(result.bytesRead, 19, 'should read 19 bytes')

  await p.completed
})

test('parseResponseAddress - errors', async (t) => {
  const p = tspl(t, { plan: 5 })

  // Buffer too small for type
  p.throws(() => parseResponseAddress(Buffer.alloc(0)), InvalidArgumentError)

  // Buffer too small for IPv4
  p.throws(() => parseResponseAddress(Buffer.from([0x01, 192])), InvalidArgumentError)

  // Buffer too small for domain length
  p.throws(() => parseResponseAddress(Buffer.from([0x03])), InvalidArgumentError)

  // Buffer too small for domain
  p.throws(() => parseResponseAddress(Buffer.from([0x03, 10, 65])), InvalidArgumentError)

  // Invalid address type
  p.throws(() => parseResponseAddress(Buffer.from([0x99, 0, 0, 0, 0, 0, 0])), InvalidArgumentError)

  await p.completed
})

test('createReplyError', async (t) => {
  const p = tspl(t, { plan: 6 })

  const err1 = createReplyError(0x01)
  p.equal(err1.message, 'General SOCKS server failure')
  p.equal(err1.code, 'SOCKS5_1')

  const err2 = createReplyError(0x05)
  p.equal(err2.message, 'Connection refused')
  p.equal(err2.code, 'SOCKS5_5')

  const err3 = createReplyError(0x99)
  p.equal(err3.message, 'Unknown SOCKS5 error code: 153')
  p.equal(err3.code, 'SOCKS5_153')

  await p.completed
})
