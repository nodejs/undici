import { bench, group, run } from 'mitata'

const CONTENT_LENGTH_STATE_START = 0
const CONTENT_LENGTH_STATE_SIGN = 1
const CONTENT_LENGTH_STATE_DIGITS = 2
const CONTENT_LENGTH_STATE_NEGATIVE_SIGN = 3
const CONTENT_LENGTH_STATE_DIGITS_NEGATIVE = 4
const CONTENT_LENGTH_STATE_DONE = 5
const CONTENT_LENGTH_STATE_INVALID = 6

const values = [
  Buffer.from('0'),
  Buffer.from('9'),
  Buffer.from('42'),
  Buffer.from(' 42'),
  Buffer.from('42 '),
  Buffer.from('\t123'),
  Buffer.from('1234'),
  Buffer.from('65535'),
  Buffer.from('1234567890'),
  Buffer.from('abc'),
  Buffer.from('   ')
]

function legacyParseContentLength (buf) {
  return parseInt(buf.toString(), 10)
}

function incrementalParseContentLength (buf) {
  let contentLength = 0
  let contentLengthState = CONTENT_LENGTH_STATE_START

  for (let i = 0; i < buf.length; i++) {
    const byte = buf[i]

    switch (contentLengthState) {
      case CONTENT_LENGTH_STATE_START:
        if (byte === 0x09 || byte === 0x0a || byte === 0x0d || byte === 0x20) {
          continue
        }

        if (byte === 0x2b || byte === 0x2d) {
          contentLengthState = byte === 0x2d
            ? CONTENT_LENGTH_STATE_NEGATIVE_SIGN
            : CONTENT_LENGTH_STATE_SIGN
          continue
        }

        if (byte >= 0x30 && byte <= 0x39) {
          contentLength = byte - 0x30
          contentLengthState = CONTENT_LENGTH_STATE_DIGITS
          continue
        }

        contentLength = Number.NaN
        contentLengthState = CONTENT_LENGTH_STATE_INVALID
        return contentLength

      case CONTENT_LENGTH_STATE_SIGN:
        if (byte >= 0x30 && byte <= 0x39) {
          contentLength = byte - 0x30
          contentLengthState = CONTENT_LENGTH_STATE_DIGITS
          continue
        }

        contentLength = Number.NaN
        contentLengthState = CONTENT_LENGTH_STATE_INVALID
        return contentLength

      case CONTENT_LENGTH_STATE_NEGATIVE_SIGN:
        if (byte >= 0x30 && byte <= 0x39) {
          contentLength = 0x30 - byte
          contentLengthState = CONTENT_LENGTH_STATE_DIGITS_NEGATIVE
          continue
        }

        contentLength = Number.NaN
        contentLengthState = CONTENT_LENGTH_STATE_INVALID
        return contentLength

      case CONTENT_LENGTH_STATE_DIGITS:
        if (byte >= 0x30 && byte <= 0x39) {
          contentLength = (contentLength * 10) + (byte - 0x30)
          continue
        }

        contentLengthState = CONTENT_LENGTH_STATE_DONE
        return contentLength

      case CONTENT_LENGTH_STATE_DIGITS_NEGATIVE:
        if (byte >= 0x30 && byte <= 0x39) {
          contentLength = (contentLength * 10) - (byte - 0x30)
          continue
        }

        contentLengthState = CONTENT_LENGTH_STATE_DONE
        return contentLength
    }
  }

  return contentLength
}

group('parse content-length', () => {
  bench('legacy', () => {
    for (let i = 0; i < values.length; i++) {
      legacyParseContentLength(values[i])
    }
  })

  bench('incremental', () => {
    for (let i = 0; i < values.length; i++) {
      incrementalParseContentLength(values[i])
    }
  })
})

await run()
