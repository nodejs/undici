'use strict'

const Busboy = require('@fastify/busboy')

function parseFormDataString (
  body,
  contentType
) {
  const cache = {
    fileMap: new Map(),
    fields: []
  }

  const bb = new Busboy({
    headers: {
      'content-type': contentType
    }
  })

  return new Promise((resolve, reject) => {
    bb.on('file', (name, file, filename, encoding, mimeType) => {
      cache.fileMap.set(name, { data: [], info: { filename, encoding, mimeType } })

      file.on('data', (data) => {
        const old = cache.fileMap.get(name)

        cache.fileMap.set(name, {
          data: [...old.data, data],
          info: old.info
        })
      }).on('end', () => {
        const old = cache.fileMap.get(name)

        cache.fileMap.set(name, {
          data: Buffer.concat(old.data),
          info: old.info
        })
      })
    })

    bb.on('field', (key, value) => cache.fields.push({ key, value }))
    bb.on('finish', () => resolve(cache))
    bb.on('error', (e) => reject(e))

    bb.end(body)
  })
}

module.exports = {
  parseFormDataString
}
