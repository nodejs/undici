'use strict'

const crypto = require('crypto')
const https = require('https')
const { test } = require('tap')
const { Client, buildConnector } = require('..')
const pem = require('https-pem')

const caFingerprint = getFingerprint(pem.cert.toString()
  .split('\n')
  .slice(1, -1)
  .map(line => line.trim())
  .join('')
)

test('Validate CA fingerprint with a custom connector', t => {
  t.plan(2)

  const server = https.createServer(pem, (req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })

  server.listen(0, function () {
    const connector = buildConnector({ rejectUnauthorized: false })
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect (opts, cb) {
        connector(opts, (err, socket) => {
          if (err) {
            cb(err)
          } else if (getIssuerCertificate(socket).fingerprint256 !== caFingerprint) {
            socket.destroy()
            cb(new Error('Fingerprint does not match'))
          } else {
            cb(null, socket)
          }
        })
      }
    })

    t.teardown(() => {
      client.close()
      server.close()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.error(err)

      data.body
        .resume()
        .on('end', () => {
          t.pass()
        })
    })
  })
})

test('Bad CA fingerprint with a custom connector', t => {
  t.plan(2)

  const server = https.createServer(pem, (req, res) => {
    res.setHeader('Content-Type', 'text/plain')
    res.end('hello')
  })

  server.listen(0, function () {
    const connector = buildConnector({ rejectUnauthorized: false })
    const client = new Client(`https://localhost:${server.address().port}`, {
      connect (opts, cb) {
        connector(opts, (err, socket) => {
          if (err) {
            cb(err)
          } else if (getIssuerCertificate(socket).fingerprint256 !== 'FO:OB:AR') {
            socket.destroy()
            cb(new Error('Fingerprint does not match'))
          } else {
            cb(null, socket)
          }
        })
      }
    })

    t.teardown(() => {
      client.close()
      server.close()
    })

    client.request({
      path: '/',
      method: 'GET'
    }, (err, data) => {
      t.equal(err.message, 'Fingerprint does not match')
      t.equal(data.body, undefined)
    })
  })
})

function getIssuerCertificate (socket) {
  let certificate = socket.getPeerCertificate(true)
  while (certificate && Object.keys(certificate).length > 0) {
    // invalid certificate
    if (certificate.issuerCertificate == null) {
      return null
    }

    // We have reached the root certificate.
    // In case of self-signed certificates, `issuerCertificate` may be a circular reference.
    if (certificate.fingerprint256 === certificate.issuerCertificate.fingerprint256) {
      break
    }

    // continue the loop
    certificate = certificate.issuerCertificate
  }
  return certificate
}

function getFingerprint (content, inputEncoding = 'base64', outputEncoding = 'hex') {
  const shasum = crypto.createHash('sha256')
  shasum.update(content, inputEncoding)
  const res = shasum.digest(outputEncoding)
  return res.toUpperCase().match(/.{1,2}/g).join(':')
}
