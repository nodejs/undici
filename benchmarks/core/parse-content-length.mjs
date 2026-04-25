import { bench, group, run } from 'mitata'

const values = [
  Buffer.from('0'),
  Buffer.from('9'),
  Buffer.from('42'),
  Buffer.from('1234'),
  Buffer.from('65535'),
  Buffer.from('1234567890')
]

function legacyParseContentLength (buf) {
  return parseInt(buf.toString(), 10)
}

function statelessParseContentLength (buf) {
  let contentLength = 0
  for (let i = 0; i < buf.length; i++) {
    contentLength = (contentLength * 10) + (buf[i] - 0x30)
  }
  return contentLength
}

group('parse content-length', () => {
  bench('legacy', () => {
    for (let i = 0; i < values.length; i++) {
      legacyParseContentLength(values[i])
    }
  })

  bench('stateless', () => {
    for (let i = 0; i < values.length; i++) {
      statelessParseContentLength(values[i])
    }
  })
})

await run()
