import { exit } from 'node:process'

/**
 * Parse the `Meta:` tags sometimes included in tests.
 * These can include resources to inject, how long it should
 * take to timeout, and which globals to expose.
 * @example
 * // META: timeout=long
 * // META: global=window,worker
 * // META: script=/common/utils.js
 * // META: script=/common/get-host-info.sub.js
 * // META: script=../request/request-error.js
 * @see https://nodejs.org/api/readline.html#readline_example_read_file_stream_line_by_line
 * @param {string} fileContents
 */
export function parseMeta (fileContents) {
  const lines = fileContents.split(/\r?\n/g)

  const meta = {
    /** @type {string|null} */
    timeout: null,
    /** @type {string[]} */
    global: [],
    /** @type {string[]} */
    scripts: []
  }

  for (const line of lines) {
    if (!line.startsWith('// META: ')) {
      break
    }

    const groups = /^\/\/ META: (?<type>.*?)=(?<match>.*)$/.exec(line)?.groups

    if (!groups) {
      console.log(`Failed to parse META tag: ${line}`)
      exit(1)
    }

    switch (groups.type) {
      case 'title':
      case 'timeout': {
        meta[groups.type] = groups.match
        break
      }
      case 'global': {
        // window,worker -> ['window', 'worker']
        meta.global.push(...groups.match.split(','))
        break
      }
      case 'script': {
        // A relative or absolute file path to the resources
        // needed for the current test.
        meta.scripts.push(groups.match)
        break
      }
      default: {
        console.log(`Unknown META tag: ${groups.type}`)
        exit(1)
      }
    }
  }

  return meta
}
