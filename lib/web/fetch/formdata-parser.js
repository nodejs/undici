'use strict'

const { webidl } = require('./webidl')
const { utf8DecodeBytes } = require('./util')
const { collectASequenceOfCodePoints, removeChars, HTTP_TOKEN_CODEPOINTS } = require('./data-url')
const { isFileLike, File: UndiciFile } = require('./file')
const { makeEntry } = require('./formdata')
const assert = require('node:assert')
const { isAscii } = require('node:buffer')

const File = globalThis.File ?? UndiciFile

/**
 * @see https://andreubotella.github.io/multipart-form-data/#multipart-form-data-boundary
 * @param {string} boundary
 */
function validateBoundary (boundary) {
  const length = boundary.length

  // - its length is greater or equal to 27 and lesser or equal to 70, and
  if (length < 27 || length > 70) {
    return false
  }

  // - it is composed by bytes in the ranges 0x30 to 0x39, 0x41 to 0x5A, or
  //   0x61 to 0x7A, inclusive (ASCII alphanumeric), or which are 0x27 ('),
  //   0x2D (-) or 0x5F (_).
  for (let i = 0; i < boundary.length; i++) {
    const cp = boundary.charCodeAt(i)

    if (!(
      (cp >= 0x30 && cp <= 0x39) ||
      (cp >= 0x41 && cp <= 0x5a) ||
      (cp >= 0x61 && cp <= 0x7a) ||
      cp === 0x27 ||
      cp === 0x3d ||
      cp === 0x5f
    )) {
      return false
    }
  }

  return true
}

/**
 * @see https://andreubotella.github.io/multipart-form-data/#escape-a-multipart-form-data-name
 * @param {string} name
 * @param {string?} encoding
 * @param {boolean?} isFilename
 */
function escapeFormDataName (name, encoding = 'utf-8', isFilename = false) {
  // 1. If isFilename is true:
  if (isFilename) {
    // 1.1. Set name to the result of converting name into a scalar value string.
    name = webidl.converters.USVString(name)
  } else {
    // 2. Otherwise:

    // 2.1. Assert: name is a scalar value string.
    assert(name === webidl.converters.USVString(name))

    // 2.2. Replace every occurrence of U+000D (CR) not followed by U+000A (LF),
    //      and every occurrence of U+000A (LF) not preceded by U+000D (CR), in
    //      name, by a string consisting of U+000D (CR) and U+000A (LF).
    name = name.replace(/\r\n?|\r?\n/g, '\r\n')
  }

  // 3. Let encoded be the result of encoding name with encoding.
  assert(Buffer.isEncoding(encoding))

  // 4. Replace every 0x0A (LF) bytes in encoded with the byte sequence `%0A`,
  //    0x0D (CR) with `%0D` and 0x22 (") with `%22`.
  name = name
    .replace(/\n/g, '%0A')
    .replace(/\r/g, '%0D')
    .replace(/"/g, '%22')

  // 5. Return encoded.
  return Buffer.from(name, encoding) // encoded
}

/**
 * @see https://andreubotella.github.io/multipart-form-data/#multipart-form-data-parser
 * @param {string} input
 * @param {ReturnType<import('./data-url')['parseMIMEType']>} mimeType
 */
function multipartFormDataParser (input, mimeType) {
  // 1. Assert: mimeType’s essence is "multipart/form-data".
  assert(mimeType !== 'failure' && mimeType.essence === 'multipart/form-data')

  // 2. If mimeType’s parameters["boundary"] does not exist, return failure.
  //    Otherwise, let boundary be the result of UTF-8 decoding mimeType’s
  //    parameters["boundary"].
  if (!mimeType.parameters.has('boundary')) {
    return 'failure'
  }

  const boundary = utf8DecodeBytes(Buffer.from(mimeType.parameters.get('boundary')))

  // 3. Let entry list be an empty entry list.
  const entryList = []

  // 4. Let position be a pointer to a byte in input, initially pointing at
  //    the first byte.
  const position = { position: 0 }

  // 5. While true:
  while (true) {
    // 5.1. If position points to a sequence of bytes starting with 0x2D 0x2D
    //      (`--`) followed by boundary, advance position by 2 + the length of
    //      boundary. Otherwise, return failure.
    if (input.slice(position.position, position.position + 2 + boundary.length) === `--${boundary}`) {
      position.position += 2 + boundary.length
    } else {
      return 'failure'
    }

    // 5.2. If position points to the sequence of bytes 0x2D 0x2D 0x0D 0x0A
    //      (`--` followed by CR LF) followed by the end of input, return entry list.
    // TODO: a FormData body doesn't need to end with CRLF?
    if (position.position === input.length - 2 && input.endsWith('--')) {
      return entryList
    }

    // 5.3. If position does not point to a sequence of bytes starting with 0x0D
    //      0x0A (CR LF), return failure.
    if (input.charCodeAt(position.position) !== 0x0d || input.charCodeAt(position.position + 1) !== 0x0a) {
      return 'failure'
    }

    // 5.4. Advance position by 2. (This skips past the newline.)
    position.position += 2

    // 5.5. Let name, filename and contentType be the result of parsing
    //      multipart/form-data headers on input and position, if the result
    //      is not failure. Otherwise, return failure.
    const result = parseMultipartFormDataHeaders(input, position)

    if (result === 'failure') {
      return 'failure'
    }

    let { name, filename, contentType } = result

    // 5.6. Advance position by 2. (This skips past the empty line that marks
    //      the end of the headers.)
    position.position += 2

    // 5.7. Let body be the empty byte sequence.
    let body = ''

    // 5.8. Body loop: While position is not past the end of input:
    // TODO: the steps here are completely wrong
    {
      const boundaryIndex = input.indexOf(boundary, position.position)

      if (boundaryIndex === -1) {
        return 'failure'
      }

      body = input.slice(position.position, boundaryIndex - 4)

      position.position += body.length
    }

    // 5.9. If position does not point to a sequence of bytes starting with
    //      0x0D 0x0A (CR LF), return failure. Otherwise, advance position by 2.
    if (input.charCodeAt(position.position) !== 0x0d || input.charCodeAt(position.position + 1) !== 0x0a) {
      return 'failure'
    } else {
      position.position += 2
    }

    // 5.10. If filename is not null:
    let value

    if (filename !== null) {
      // 5.10.1. If contentType is null, set contentType to "text/plain".
      contentType ??= 'text/plain'

      // 5.10.2. If contentType is not an ASCII string, set contentType to the empty string.
      if (!isAscii(Buffer.from(contentType))) {
        contentType = ''
      }

      // 5.10.3. Let value be a new File object with name filename, type contentType, and body body.
      value = new File([body], filename, { type: contentType })
    } else {
      // 5.11. Otherwise:

      // 5.11.1. Let value be the UTF-8 decoding without BOM of body.
      value = utf8DecodeBytes(Buffer.from(body))
    }

    // 5.12. Assert: name is a scalar value string and value is either a scalar value string or a File object.
    assert(name === webidl.converters.USVString(name))
    assert((typeof value === 'string' && value === webidl.converters.USVString(value)) || isFileLike(value))

    // 5.13. Create an entry with name and value, and append it to entry list.
    entryList.push(makeEntry(name, value, filename))
  }
}

/**
 * @see https://andreubotella.github.io/multipart-form-data/#parse-multipart-form-data-headers
 * @param {string} input
 * @param {{ position: number }} position
 */
function parseMultipartFormDataHeaders (input, position) {
  // 1. Let name, filename and contentType be null.
  let name = null
  let filename = null
  let contentType = null

  // 2. While true:
  while (true) {
    // 2.1. If position points to a sequence of bytes starting with 0x0D 0x0A (CR LF):
    if (input.charCodeAt(position.position) === 0x0d && input.charCodeAt(position.position + 1) === 0x0a) {
      // 2.1.1. If name is null, return failure.
      if (name === null) {
        return 'failure'
      }

      // 2.1.2. Return name, filename and contentType.
      return { name, filename, contentType }
    }

    // 2.2. Let header name be the result of collecting a sequence of bytes that are
    //      not 0x0A (LF), 0x0D (CR) or 0x3A (:), given position.
    let headerName = collectASequenceOfCodePoints(
      (char) => char !== '\n' && char !== '\n' && char !== ':',
      input,
      position
    )

    // 2.3. Remove any HTTP tab or space bytes from the start or end of header name.
    headerName = removeChars(headerName, true, true, (char) => char === 0x9 || char === 0x20)

    // 2.4. If header name does not match the field-name token production, return failure.
    if (!HTTP_TOKEN_CODEPOINTS.test(headerName)) {
      return 'failure'
    }

    // 2.5. If the byte at position is not 0x3A (:), return failure.
    if (input.charCodeAt(position.position) !== 0x3a) {
      return 'failure'
    }

    // 2.6. Advance position by 1.
    position.position++

    // 2.7. Collect a sequence of bytes that are HTTP tab or space bytes given position.
    //      (Do nothing with those bytes.)
    collectASequenceOfCodePoints(
      (char) => char === ' ' || char === '\t',
      input,
      position
    )

    // 2.8. Byte-lowercase header name and switch on the result:
    switch (headerName.toLowerCase()) {
      case 'content-disposition': {
        // 1. Set name and filename to null.
        name = filename = null

        // 2. If position does not point to a sequence of bytes starting with
        //    `form-data; name="`, return failure.
        if (!input.slice(position.position).startsWith('form-data; name="')) {
          return 'failure'
        }

        // 3. Advance position so it points at the byte after the next 0x22 (")
        //    byte (the one in the sequence of bytes matched above).
        position.position += 17

        // 4. Set name to the result of parsing a multipart/form-data name given
        //    input and position, if the result is not failure. Otherwise, return
        //    failure.
        name = parseMultipartFormDataName(input, position)

        if (name === false) {
          return 'failure'
        }

        // 5. If position points to a sequence of bytes starting with `; filename="`:
        if (input.slice(position.position).startsWith('; filename="')) {
          // 1. Advance position so it points at the byte after the next 0x22 (") byte
          //    (the one in the sequence of bytes matched above).
          position.position += 13

          // 2. Set filename to the result of parsing a multipart/form-data name given
          //    input and position, if the result is not failure. Otherwise, return failure.
          filename = parseMultipartFormDataName(input, position)

          if (filename === false) {
            return 'failure'
          }
        }

        break
      }
      case 'content-type': {
        // 1. Let header value be the result of collecting a sequence of bytes that are
        //    not 0x0A (LF) or 0x0D (CR), given position.
        let headerValue = collectASequenceOfCodePoints(
          (char) => char !== '\r' && char !== '\n',
          input,
          position
        )

        // 2. Remove any HTTP tab or space bytes from the end of header value.
        headerValue = removeChars(headerValue, false, true, (char) => char === 0x9 || char === 0x20)

        // 3. Set contentType to the isomorphic decoding of header value.
        contentType = headerValue

        break
      }
      default: {
        // Collect a sequence of bytes that are not 0x0A (LF) or 0x0D (CR), given position.
        // (Do nothing with those bytes.)
        collectASequenceOfCodePoints(
          (char) => char !== '\n' && char !== '\r',
          input,
          position
        )
      }
    }

    // 2.9. If position does not point to a sequence of bytes starting with 0x0D 0x0A
    //      (CR LF), return failure. Otherwise, advance position by 2 (past the newline).
    if (input.charCodeAt(position.position) !== 0x0d && input.charCodeAt(position.position + 1) !== 0x0a) {
      return 'failure'
    } else {
      position.position += 2
    }
  }
}

/**
 * @see https://andreubotella.github.io/multipart-form-data/#parse-a-multipart-form-data-name
 * @param {string} input
 * @param {{ position: number }} position
 */
function parseMultipartFormDataName (input, position) {
  // 1. Assert: The byte at (position - 1) is 0x22 (").
  assert(input.charCodeAt(position.position - 1) === 0x22)

  // 2. Let name be the result of collecting a sequence of bytes that are not 0x0A (LF), 0x0D (CR) or 0x22 ("), given position.
  let name = collectASequenceOfCodePoints(
    (char) => char !== '\n' && char !== '\r' && char !== '"',
    input,
    position
  )

  // 3. If the byte at position is not 0x22 ("), return failure. Otherwise, advance position by 1.
  if (input.charCodeAt(position.position) !== 0x22) {
    return false // name could be 'failure'
  } else {
    position.position++
  }

  // 4. Replace any occurrence of the following subsequences in name with the given byte:
  // - `%0A`: 0x0A (LF)
  // - `%0D`: 0x0D (CR)
  // - `%22`: 0x22 (")
  name = name
    .replace(/%0A/i, '\n')
    .replace(/%0D/i, '\r')
    .replace(/%22/, '"')

  // 5. Return the UTF-8 decoding without BOM of name.
  return Buffer.from(name, 'utf-8').toString('utf-8')
}

module.exports = {
  multipartFormDataParser
}
