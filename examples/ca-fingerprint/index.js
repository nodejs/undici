'use strict'

const crypto = require('crypto')
const https = require('https')
const { Client, buildConnector } = require('../..')
const pem = require('https-pem')

const caFingerprint = getFingerprint(pem.cert.toString()
  .split('\n')
  .slice(1, -1)
  .map(line => line.trim())
  .join('')
)

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

  client.request({
    path: '/',
    method: 'GET'
  }, (err, data) => {
    if (err) throw err

    const bufs = []
    data.body.on('data', (buf) => {
      bufs.push(buf)
    })
    data.body.on('end', () => {
      console.log(Buffer.concat(bufs).toString('utf8'))
      client.close()
      server.close()
    })
  })
})

function getIssuerCertificate (socket) {
  let certificate = socket.getPeerCertificate(true)
  while (certificate && Object.keys(certificate).length > 0) {
    if (certificate.issuerCertificate !== undefined) {
      // For self-signed certificates, `issuerCertificate` may be a circular reference.
      if (certificate.fingerprint256 === certificate.issuerCertificate.fingerprint256) {
        break
      }
      certificate = certificate.issuerCertificate
    } else {
      break
    }
  }
  return certificate
}

function getFingerprint (content, inputEncoding = 'base64', outputEncoding = 'hex') {
  const shasum = crypto.createHash('sha256')
  shasum.update(content, inputEncoding)
  const res = shasum.digest(outputEncoding)
  return res.toUpperCase().match(/.{1,2}/g).join(':')
}
