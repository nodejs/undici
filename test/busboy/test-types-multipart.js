'use strict'

const assert = require('node:assert')
const { inspect } = require('node:util')
const { describe } = require('node:test')
const { Response } = require('../..')

const active = new Map()

const tests = [
  {
    source: [
      ['-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; name="file_name_0"',
        '',
        'super alpha file',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; name="file_name_1"',
        '',
        'super beta file',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="upload_file_0"; filename="1k_a.dat"',
        'Content-Type: application/octet-stream',
        '',
        'A'.repeat(1023),
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="upload_file_1"; filename="1k_b.dat"',
        'Content-Type: application/octet-stream',
        '',
        'B'.repeat(1023),
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k--'
      ].join('\r\n')
    ],
    boundary: '---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    expected: [
      {
        type: 'field',
        name: 'file_name_0',
        val: 'super alpha file',
        info: {
          encoding: '7bit',
          mimeType: 'text/plain'
        }
      },
      {
        type: 'field',
        name: 'file_name_1',
        val: 'super beta file',
        info: {
          encoding: '7bit',
          mimeType: 'text/plain'
        }
      },
      {
        type: 'file',
        name: 'upload_file_0',
        data: Buffer.from('A'.repeat(1023)),
        info: {
          filename: '1k_a.dat',
          encoding: '7bit',
          mimeType: 'application/octet-stream'
        }
      },
      {
        type: 'file',
        name: 'upload_file_1',
        data: Buffer.from('B'.repeat(1023)),
        info: {
          filename: '1k_b.dat',
          encoding: '7bit',
          mimeType: 'application/octet-stream'
        }
      }
    ],
    what: 'Fields and files'
  },
  {
    source: [
      ['------WebKitFormBoundaryTB2MiQ36fnSJlrhY',
        'Content-Disposition: form-data; name="cont"',
        '',
        'some random content',
        '------WebKitFormBoundaryTB2MiQ36fnSJlrhY',
        'Content-Disposition: form-data; name="pass"',
        '',
        'some random pass',
        '------WebKitFormBoundaryTB2MiQ36fnSJlrhY',
        'Content-Disposition: form-data; name="bit"',
        '',
        '2',
        '------WebKitFormBoundaryTB2MiQ36fnSJlrhY--'
      ].join('\r\n')
    ],
    boundary: '----WebKitFormBoundaryTB2MiQ36fnSJlrhY',
    expected: [
      {
        type: 'field',
        name: 'cont',
        val: 'some random content',
        info: {
          encoding: '7bit',
          mimeType: 'text/plain'
        }
      },
      {
        type: 'field',
        name: 'pass',
        val: 'some random pass',
        info: {
          encoding: '7bit',
          mimeType: 'text/plain'
        }
      },
      {
        type: 'field',
        name: 'bit',
        val: '2',
        info: {
          encoding: '7bit',
          mimeType: 'text/plain'
        }
      }
    ],
    what: 'Fields only'
  },
  {
    source: [
      ''
    ],
    boundary: '----WebKitFormBoundaryTB2MiQ36fnSJlrhY',
    expected: [
      { error: 'Unexpected end of form' }
    ],
    what: 'No fields and no files'
  },
  {
    source: [
      ['-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="upload_file_0"; filename="/tmp/1k_a.dat"',
        'Content-Type: application/octet-stream',
        '',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="upload_file_1"; filename="C:\\files\\1k_b.dat"',
        'Content-Type: application/octet-stream',
        '',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="upload_file_2"; filename="relative/1k_c.dat"',
        'Content-Type: application/octet-stream',
        '',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k--'
      ].join('\r\n')
    ],
    boundary: '---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    expected: [
      {
        type: 'file',
        name: 'upload_file_0',
        data: Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
        info: {
          filename: '/tmp/1k_a.dat',
          encoding: '7bit',
          mimeType: 'application/octet-stream'
        }
      },
      {
        type: 'file',
        name: 'upload_file_1',
        data: Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
        info: {
          filename: 'C:\\files\\1k_b.dat',
          encoding: '7bit',
          mimeType: 'application/octet-stream'
        }
      },
      {
        type: 'file',
        name: 'upload_file_2',
        data: Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
        info: {
          filename: 'relative/1k_c.dat',
          encoding: '7bit',
          mimeType: 'application/octet-stream'
        }
      }
    ],
    what: 'Files with filenames containing paths preserve path'
  },
  {
    source: [
      ['-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="upload_file_0"; filename="/absolute/1k_a.dat"',
        'Content-Type: application/octet-stream',
        '',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="upload_file_1"; filename="C:\\absolute\\1k_b.dat"',
        'Content-Type: application/octet-stream',
        '',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="upload_file_2"; filename="relative/1k_c.dat"',
        'Content-Type: application/octet-stream',
        '',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k--'
      ].join('\r\n')
    ],
    boundary: '---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    expected: [
      {
        type: 'file',
        name: 'upload_file_0',
        data: Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
        info: {
          filename: '/absolute/1k_a.dat',
          encoding: '7bit',
          mimeType: 'application/octet-stream'
        }
      },
      {
        type: 'file',
        name: 'upload_file_1',
        data: Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
        info: {
          filename: 'C:\\absolute\\1k_b.dat',
          encoding: '7bit',
          mimeType: 'application/octet-stream'
        }
      },
      {
        type: 'file',
        name: 'upload_file_2',
        data: Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
        info: {
          filename: 'relative/1k_c.dat',
          encoding: '7bit',
          mimeType: 'application/octet-stream'
        }
      }
    ],
    what: 'Paths to be preserved'
  },
  {
    source: [
      ['------WebKitFormBoundaryTB2MiQ36fnSJlrhY',
        'Content-Disposition: form-data; name="cont"',
        'Content-Type: ',
        '',
        'some random content',
        '------WebKitFormBoundaryTB2MiQ36fnSJlrhY--'
      ].join('\r\n')
    ],
    boundary: '----WebKitFormBoundaryTB2MiQ36fnSJlrhY',
    expected: [
      {
        type: 'field',
        name: 'cont',
        val: 'some random content',
        info: {
          encoding: '7bit',
          mimeType: 'text/plain'
        }
      }
    ],
    what: 'Empty content-type defaults to text/plain'
  },
  {
    source: [
      ['-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="file"; filename*="utf-8\'\'n%C3%A4me.txt"',
        'Content-Type: application/octet-stream',
        '',
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k--'
      ].join('\r\n')
    ],
    boundary: '---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    expected: [
      {
        type: 'file',
        name: 'file',
        data: Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ'),
        info: {
          filename: 'utf-8\'\'n%C3%A4me.txt',
          encoding: '7bit',
          mimeType: 'application/octet-stream'
        }
      }
    ],
    what: 'Unicode filenames'
  },
  {
    source: [
      ['--asdasdasdasd\r\n',
        'Content-Type: text/plain\r\n',
        'Content-Disposition: form-data; name="foo"\r\n',
        '\r\n',
        'asd\r\n',
        '--asdasdasdasd--'
      ].join(':)')
    ],
    boundary: 'asdasdasdasd',
    expected: [
      { error: 'Malformed part header' }
    ],
    what: 'Stopped mid-header'
  },
  {
    source: [
      ['------WebKitFormBoundaryTB2MiQ36fnSJlrhY',
        'Content-Disposition: form-data; name="cont"',
        'Content-Type: application/json',
        '',
        '{}',
        '------WebKitFormBoundaryTB2MiQ36fnSJlrhY--'
      ].join('\r\n')
    ],
    boundary: '----WebKitFormBoundaryTB2MiQ36fnSJlrhY',
    expected: [
      {
        type: 'field',
        name: 'cont',
        val: '{}',
        info: {
          encoding: '7bit',
          // TODO: there's no way to get the content-type of a field
          mimeType: 'text/plain' // 'application/json'
        }
      }
    ],
    what: 'content-type for fields'
  },
  {
    source: [
      '------WebKitFormBoundaryTB2MiQ36fnSJlrhY--'
    ],
    boundary: '----WebKitFormBoundaryTB2MiQ36fnSJlrhY',
    expected: [],
    what: 'empty form'
  },
  {
    source: [
      ['-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name=upload_file_0; filename="1k_a.dat"',
        'Content-Type: application/octet-stream',
        'Content-Transfer-Encoding: binary',
        '',
        ''
      ].join('\r\n')
    ],
    boundary: '---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    expected: [
      { error: 'Unexpected end of form' }
    ],
    what: 'Stopped mid-file #1'
  },
  {
    source: [
      ['-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name=upload_file_0; filename="1k_a.dat"',
        'Content-Type: application/octet-stream',
        '',
        'a'
      ].join('\r\n')
    ],
    boundary: '---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    expected: [
      { error: 'Unexpected end of form' }
    ],
    what: 'Stopped mid-file #2'
  },
  {
    source: [
      ['-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="upload_file_0"; filename="notes.txt"',
        'Content-Type: text/plain; charset=utf8',
        '',
        'a',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k--'
      ].join('\r\n')
    ],
    boundary: '---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    expected: [
      {
        type: 'file',
        name: 'upload_file_0',
        data: Buffer.from('a'),
        info: {
          filename: 'notes.txt',
          encoding: '7bit',
          mimeType: 'text/plain; charset=utf8'
        }
      }
    ],
    what: 'Text file with charset'
  },
  {
    source: [
      ['-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         `name="upload_file_0"; filename="${'a'.repeat(64 * 1024)}.txt"`,
        'Content-Type: text/plain; charset=utf8',
        '',
        'ab',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="upload_file_1"; filename="notes2.txt"',
        'Content-Type: text/plain; charset=utf8',
        '',
        'cd',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k--'
      ].join('\r\n')
    ],
    boundary: '---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    expected: [
      // TODO: the RFC does not mention the max size of a filename?
      {
        type: 'file',
        name: 'upload_file_0',
        data: Buffer.from('ab'),
        info: {
          filename: `${'a'.repeat(64 * 1024)}.txt`,
          encoding: '7bit',
          mimeType: 'text/plain; charset=utf8'
        }
      }, // { error: 'Malformed part header' },
      {
        type: 'file',
        name: 'upload_file_1',
        data: Buffer.from('cd'),
        info: {
          filename: 'notes2.txt',
          encoding: '7bit',
          mimeType: 'text/plain; charset=utf8'
        }
      }
    ],
    what: 'Oversized part header'
  },
  {
    source: [
      ['-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         'name="upload_file_0"; filename="notes.txt"',
        'Content-Type: text/plain; charset=utf8',
        '',
        'a'.repeat(31) + '\r'
      ].join('\r\n'),
      'b'.repeat(40),
      '\r\n-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k--'
    ],
    boundary: '---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    expected: [
      {
        type: 'file',
        name: 'upload_file_0',
        data: Buffer.from('a'.repeat(31) + '\r' + 'b'.repeat(40)),
        info: {
          filename: 'notes.txt',
          encoding: '7bit',
          mimeType: 'text/plain; charset=utf8'
        }
      }
    ],
    what: 'Lookbehind data should not stall file streams'
  },
  {
    source: [
      ['-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         `name="upload_file_0"; filename="${'a'.repeat(8 * 1024)}.txt"`,
        'Content-Type: text/plain; charset=utf8',
        '',
        'ab',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         `name="upload_file_1"; filename="${'b'.repeat(8 * 1024)}.txt"`,
        'Content-Type: text/plain; charset=utf8',
        '',
        'cd',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
        'Content-Disposition: form-data; ' +
         `name="upload_file_2"; filename="${'c'.repeat(8 * 1024)}.txt"`,
        'Content-Type: text/plain; charset=utf8',
        '',
        'ef',
        '-----------------------------paZqsnEHRufoShdX6fh0lUhXBP4k--'
      ].join('\r\n')
    ],
    boundary: '---------------------------paZqsnEHRufoShdX6fh0lUhXBP4k',
    expected: [
      {
        type: 'file',
        name: 'upload_file_0',
        data: Buffer.from('ab'),
        info: {
          filename: `${'a'.repeat(8 * 1024)}.txt`,
          encoding: '7bit',
          mimeType: 'text/plain; charset=utf8'
        }
      },
      {
        type: 'file',
        name: 'upload_file_1',
        data: Buffer.from('cd'),
        info: {
          filename: `${'b'.repeat(8 * 1024)}.txt`,
          encoding: '7bit',
          mimeType: 'text/plain; charset=utf8'
        }
      },
      {
        type: 'file',
        name: 'upload_file_2',
        data: Buffer.from('ef'),
        info: {
          filename: `${'c'.repeat(8 * 1024)}.txt`,
          encoding: '7bit',
          mimeType: 'text/plain; charset=utf8'
        }
      }
    ],
    what: 'Large filename'
  },
  {
    source: [
      '\r\n--d1bf46b3-aa33-4061-b28d-6c5ced8b08ee\r\n',
      'Content-Type: application/gzip\r\n' +
        'Content-Encoding: gzip\r\n' +
        'Content-Disposition: form-data; name="batch-1"; filename="batch-1"' +
        '\r\n\r\n' +
      '\r\n--d1bf46b3-aa33-4061-b28d-6c5ced8b08ee--'
    ],
    boundary: 'd1bf46b3-aa33-4061-b28d-6c5ced8b08ee',
    expected: [
      {
        type: 'file',
        name: 'batch-1',
        data: Buffer.alloc(0),
        info: {
          filename: 'batch-1',
          encoding: '7bit',
          mimeType: 'application/gzip'
        }
      }
    ],
    what: 'Empty part'
  }
]

describe('FormData parsing tests', async (t) => {
  for (const test of tests) {
    active.set(test, 1)

    const { what, boundary, source } = test

    const body = source.reduce((a, b) => a + b, '')
    const response = new Response(body, {
      headers: {
        'content-type': `multipart/form-data; boundary=${boundary}`
      }
    })

    let fd
    const results = []

    try {
      fd = await response.formData()
    } catch (e) {
      results.push({ error: e.message })

      if (test.expected.length === 1 && test.expected[0].error) {
        active.delete(test)
      }

      continue
    }

    for (const [name, value] of fd) {
      if (typeof value === 'string') { // field
        results.push({
          type: 'field',
          name,
          val: value,
          info: {
            encoding: '7bit',
            mimeType: 'text/plain'
          }
        })
      } else { // File
        results.push({
          type: 'file',
          name,
          data: Buffer.from(await value.arrayBuffer()),
          info: {
            filename: value.name,
            encoding: '7bit',
            mimeType: value.type
          }
        })
      }
    }

    active.delete(test)

    assert.deepStrictEqual(
      results,
      test.expected,
      `[${what}] Results mismatch.\n` +
        `Parsed: ${inspect(results)}\n` +
        `Expected: ${inspect(test.expected)}`
    )
  }
})
