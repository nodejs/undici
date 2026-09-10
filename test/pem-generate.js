'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { X509Certificate } = require('node:crypto')
const { createSecureServer } = require('node:http2')
const { once } = require('node:events')
const forge = require('node-forge')
const upstream = require('@metcoder95/https-pem')
const pem = require('./utils/pem')

// `selfsigned` derives the certificate serial number from 9 random bytes and
// runs them through its own `toPositiveHex()`, which clears the sign bit but
// does not re-minimise the resulting DER INTEGER. The seed below leaves two
// redundant leading zero bytes in it, and node-forge's encoder strips only one
// of them (see the "should all leading bytes be stripped vs just one?" TODO in
// its asn1.js), so OpenSSL refuses to load the certificate with
// ERR_OSSL_ASN1_ILLEGAL_PADDING. It hits 1 in 65536 generated certificates,
// which made every test that builds a TLS/HTTP2 server from a freshly
// generated pair flaky.
const ILLEGAL_PADDING_SEED = '\x80\x00\x01\x02\x03\x04\x05\x06\x07'

// Turns the next `attempts` serial numbers into the pathological one above.
// Returns a getter for how many of them were actually consumed, so a test can
// tell whether it exercised the bad path at all.
function forceIllegalSerialNumber (t, attempts = 1) {
  const getBytesSync = forge.random.getBytesSync
  let remaining = attempts

  forge.random.getBytesSync = function (count) {
    // 9 bytes are only ever requested for the serial number
    if (count === 9 && remaining > 0) {
      remaining--
      return ILLEGAL_PADDING_SEED
    }
    return getBytesSync.call(this, count)
  }
  t.after(() => { forge.random.getBytesSync = getBytesSync })

  return () => attempts - remaining
}

test('the upstream generator produces certificates OpenSSL rejects', async t => {
  const consumed = forceIllegalSerialNumber(t)

  const { cert } = await upstream.generate({ opts: { keySize: 1024 } })
  assert.strictEqual(consumed(), 1, 'the serial number seed was not used')

  let err
  try {
    new X509Certificate(cert) // eslint-disable-line no-new
  } catch (e) {
    err = e
  }

  if (err === undefined) {
    // Nothing to work around anymore: `test/utils/pem.js` can go away and the
    // tests can require `@metcoder95/https-pem` directly again.
    t.diagnostic('upstream no longer emits non-minimal serial numbers')
    return
  }

  assert.strictEqual(err.code, 'ERR_OSSL_ASN1_ILLEGAL_PADDING')
})

test('generate() retries until the certificate is loadable', async t => {
  const consumed = forceIllegalSerialNumber(t)

  const { key, cert } = await pem.generate({ opts: { keySize: 1024 } })
  assert.strictEqual(consumed(), 1, 'the serial number seed was not used')

  assert.ok(key)
  const parsed = new X509Certificate(cert)
  // A minimally-encoded positive INTEGER never starts with a zero byte
  assert.doesNotMatch(parsed.serialNumber, /^00/)
})

test('generate() survives consecutive bad serial numbers', async t => {
  const consumed = forceIllegalSerialNumber(t, 2)

  const { cert } = await pem.generate({ opts: { keySize: 1024 } })
  assert.strictEqual(consumed(), 2, 'not every serial number seed was used')

  new X509Certificate(cert) // eslint-disable-line no-new
})

test('generate() gives up instead of returning a broken pair', async t => {
  forceIllegalSerialNumber(t, Infinity)

  await assert.rejects(
    pem.generate({ opts: { keySize: 1024 } }),
    err => {
      assert.match(err.message, /could not generate a loadable certificate/)
      assert.strictEqual(err.cause.code, 'ERR_OSSL_ASN1_ILLEGAL_PADDING')
      return true
    }
  )
})

test('the postinstall pair is loadable', () => {
  // 13 test files build their server straight from it
  const cert = new X509Certificate(pem.cert)
  assert.ok(pem.key)
  assert.doesNotMatch(cert.serialNumber, /^00/)
})

test('createSecureServer accepts a generated pair', async t => {
  forceIllegalSerialNumber(t)

  const server = createSecureServer(await pem.generate({ opts: { keySize: 2048 } }))
  t.after(() => server.close())

  await once(server.listen(0), 'listening')
  assert.ok(server.address().port)
})
