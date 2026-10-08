'use strict'

const { test } = require('node:test')
const { execFile } = require('node:child_process')
const { join } = require('node:path')
const { promisify } = require('node:util')
const { buildSync } = require('esbuild')

const execFileAsync = promisify(execFile)
const buildOptions = {
  absWorkingDir: join(__dirname, '../..'),
  entryPoints: ['index-fetch.js'],
  bundle: true,
  platform: 'node',
  outfile: 'undici-fetch.js',
  keepNames: true,
  metafile: true,
  write: false
}

test('Node.js core bundle excludes Milo', (t) => {
  const { metafile } = buildSync({ ...buildOptions, define: { esbuildDetection: '1' } })
  const inputs = Object.keys(metafile.inputs)

  t.assert.ok(inputs.includes('lib/llhttp/llhttp-wasm.js'))
  t.assert.ok(inputs.includes('lib/llhttp/llhttp_simd-wasm.js'))
  t.assert.ok(!inputs.includes('lib/dispatcher/parser-h1.js'))
  t.assert.ok(!inputs.some(path => path.startsWith('lib/milo/')))
})

test('ordinary esbuild bundles retain experimental Milo', (t) => {
  const { metafile } = buildSync(buildOptions)
  const inputs = Object.keys(metafile.inputs)

  t.assert.ok(inputs.includes('lib/dispatcher/parser-h1.js'))
  t.assert.ok(inputs.includes('lib/milo/src/simd/index.js'))
  t.assert.ok(inputs.includes('lib/milo/src/no-simd/index.js'))
})

for (const simd of ['0', '1']) {
  for (const milo of ['false', '1', 'true']) {
    test(`Node.js core uses only llhttp with UNDICI_NO_WASM_SIMD=${simd} and UNDICI_USE_MILO=${milo}`, async (t) => {
      const { stdout, stderr } = await execFileAsync(process.execPath, [join(__dirname, '../fixtures/core-bundle-parser.js')], {
        env: {
          ...process.env,
          UNDICI_NO_WASM_SIMD: simd,
          UNDICI_USE_MILO: milo
        },
        timeout: 30000
      })

      t.assert.strictEqual(stdout, '')
      t.assert.strictEqual(stderr, '')
    })
  }
}
