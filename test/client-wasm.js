'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test } = require('node:test')

  ;[
  ['generic', require('../lib/llhttp/llhttp-wasm.js')],
  ['simd', require('../lib/llhttp/llhttp_simd-wasm.js')]
].forEach(([name, llhttp]) => {
  describe(name, () => {
    test('can compile the wasm code', async () => {
      await WebAssembly.compile(llhttp)
    })

    test('can instantiate the wasm code', async () => {
      const mod = await WebAssembly.compile(llhttp)
      await WebAssembly.instantiate(mod, {
        env: {
          wasm_on_url: () => { },
          wasm_on_status: () => { },
          wasm_on_message_begin: () => { },
          wasm_on_header_field: () => { },
          wasm_on_header_value: () => { },
          wasm_on_headers_complete: () => { },
          wasm_on_body: () => { },
          wasm_on_message_complete: () => { }
        }
      })
    })

    describe('exports', async () => {
      const mod = await WebAssembly.compile(llhttp)
      const instance = await WebAssembly.instantiate(mod, {
        env: {
          wasm_on_url: () => { },
          wasm_on_status: () => { },
          wasm_on_message_begin: () => { },
          wasm_on_header_field: () => { },
          wasm_on_header_value: () => { },
          wasm_on_headers_complete: () => { },
          wasm_on_body: () => { },
          wasm_on_message_complete: () => { }
        }
      })

      test('has the right amount of exports', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(instance.exports, 'exports are present')
        t.deepStrictEqual(Object.keys(instance.exports), [
          'memory',
          '_initialize',
          '__indirect_function_table',
          'llhttp_init',
          'llhttp_should_keep_alive',
          'llhttp_alloc',
          'malloc',
          'llhttp_free',
          'free',
          'llhttp_get_type',
          'llhttp_get_http_major',
          'llhttp_get_http_minor',
          'llhttp_get_method',
          'llhttp_get_status_code',
          'llhttp_get_upgrade',
          'llhttp_reset',
          'llhttp_execute',
          'llhttp_settings_init',
          'llhttp_finish',
          'llhttp_pause',
          'llhttp_resume',
          'llhttp_resume_after_upgrade',
          'llhttp_get_errno',
          'llhttp_get_error_reason',
          'llhttp_set_error_reason',
          'llhttp_get_error_pos',
          'llhttp_errno_name',
          'llhttp_method_name',
          'llhttp_status_name',
          'llhttp_set_lenient_headers',
          'llhttp_set_lenient_chunked_length',
          'llhttp_set_lenient_keep_alive',
          'llhttp_set_lenient_transfer_encoding',
          'llhttp_set_lenient_version',
          'llhttp_set_lenient_data_after_close',
          'llhttp_set_lenient_optional_lf_after_cr',
          'llhttp_set_lenient_optional_crlf_after_chunk',
          'llhttp_set_lenient_optional_cr_before_lf',
          'llhttp_set_lenient_spaces_after_chunk_size',
          'llhttp_message_needs_eof'
        ])
        await t.completed
      })

      test('instance.exports.memory', async (t) => {
        t = tspl(t, { plan: 1 })

        t.ok(instance.exports.memory instanceof WebAssembly.Memory, 'memory is present')
      })

      // _initialize
      test('instance.exports._initialize', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports._initialize === 'function', '_initialize is present')
        t.strictEqual(instance.exports._initialize.length, 0, '_initialize has the right number of arguments')
      })

      // __indirect_function_table
      test('instance.exports.__indirect_function_table', async (t) => {
        t = tspl(t, { plan: 1 })

        t.ok(instance.exports.__indirect_function_table instanceof WebAssembly.Table, '__indirect_function_table is present')
      })

      // malloc
      test('instance.exports.malloc', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.malloc === 'function', 'malloc is present')
        t.strictEqual(instance.exports.malloc.length, 1, 'malloc has the right number of arguments')
      })

      // free
      test('instance.exports.free', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.free === 'function', 'free is present')
        t.strictEqual(instance.exports.free.length, 1, 'free has the right number of arguments')
      })

      // llhttp_init
      test('instance.exports.llhttp_init', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_init === 'function', 'llhttp_init is present')
        t.strictEqual(instance.exports.llhttp_init.length, 3, 'llhttp_init has the right number of arguments')
      })

      // llhttp_alloc
      test('instance.exports.llhttp_alloc', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_alloc === 'function', 'llhttp_alloc is present')
        t.strictEqual(instance.exports.llhttp_alloc.length, 1, 'llhttp_alloc has the right number of arguments')
      })

      // llhttp_free
      test('instance.exports.llhttp_free', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_free === 'function', 'llhttp_free is present')
        t.strictEqual(instance.exports.llhttp_free.length, 1, 'llhttp_free has the right number of arguments')
      })

      // llhttp_get_type
      test('instance.exports.llhttp_get_type', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_get_type === 'function', 'llhttp_get_type is present')
        t.strictEqual(instance.exports.llhttp_get_type.length, 1, 'llhttp_get_type has the right number of arguments')
      })

      // llhttp_should_keep_alive
      test('instance.exports.llhttp_should_keep_alive', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_should_keep_alive === 'function', 'llhttp_should_keep_alive is present')
        t.strictEqual(instance.exports.llhttp_should_keep_alive.length, 1, 'llhttp_should_keep_alive has the right number of arguments')
      })

      // llhttp_get_http_major
      test('instance.exports.llhttp_get_http_major', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_get_http_major === 'function', 'llhttp_get_http_major is present')
        t.strictEqual(instance.exports.llhttp_get_http_major.length, 1, 'llhttp_get_http_major has the right number of arguments')
      })

      // llhttp_get_http_minor
      test('instance.exports.llhttp_get_http_minor', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_get_http_minor === 'function', 'llhttp_get_http_minor is present')
        t.strictEqual(instance.exports.llhttp_get_http_minor.length, 1, 'llhttp_get_http_minor has the right number of arguments')
      })

      // llhttp_get_method
      test('instance.exports.llhttp_get_method', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_get_method === 'function', 'llhttp_get_method is present')
        t.strictEqual(instance.exports.llhttp_get_method.length, 1, 'llhttp_get_method has the right number of arguments')
      })

      // llhttp_get_status_code
      test('instance.exports.llhttp_get_status_code', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_get_status_code === 'function', 'llhttp_get_status_code is present')
        t.strictEqual(instance.exports.llhttp_get_status_code.length, 1, 'llhttp_get_status_code has the right number of arguments')
      })

      // llhttp_get_upgrade
      test('instance.exports.llhttp_get_upgrade', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_get_upgrade === 'function', 'llhttp_get_upgrade is present')
        t.strictEqual(instance.exports.llhttp_get_upgrade.length, 1, 'llhttp_get_upgrade has the right number of arguments')
      })

      // llhttp_reset
      test('instance.exports.llhttp_reset', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_reset === 'function', 'llhttp_reset is present')
        t.strictEqual(instance.exports.llhttp_reset.length, 1, 'llhttp_reset has the right number of arguments')
      })

      // llhttp_execute
      test('instance.exports.llhttp_execute', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_execute === 'function', 'llhttp_execute is present')
        t.strictEqual(instance.exports.llhttp_execute.length, 3, 'llhttp_execute has the right number of arguments')
      })

      // llhttp_settings_init
      test('instance.exports.llhttp_settings_init', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_settings_init === 'function', 'llhttp_settings_init is present')
        t.strictEqual(instance.exports.llhttp_settings_init.length, 1, 'llhttp_settings_init has the right number of arguments')
      })

      // llhttp_finish
      test('instance.exports.llhttp_finish', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_finish === 'function', 'llhttp_finish is present')
        t.strictEqual(instance.exports.llhttp_finish.length, 1, 'llhttp_finish has the right number of arguments')
      })

      // llhttp_pause
      test('instance.exports.llhttp_pause', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_pause === 'function', 'llhttp_pause is present')
        t.strictEqual(instance.exports.llhttp_pause.length, 1, 'llhttp_pause has the right number of arguments')
      })

      // llhttp_resume
      test('instance.exports.llhttp_resume', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_resume === 'function', 'llhttp_resume is present')
        t.strictEqual(instance.exports.llhttp_resume.length, 1, 'llhttp_resume has the right number of arguments')
      })

      // llhttp_resume_after_upgrade
      test('instance.exports.llhttp_resume_after_upgrade', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_resume_after_upgrade === 'function', 'llhttp_resume_after_upgrade is present')
        t.strictEqual(instance.exports.llhttp_resume_after_upgrade.length, 1, 'llhttp_resume_after_upgrade has the right number of arguments')
      })

      // llhttp_get_errno
      test('instance.exports.llhttp_get_errno', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_get_errno === 'function', 'llhttp_get_errno is present')
        t.strictEqual(instance.exports.llhttp_get_errno.length, 1, 'llhttp_get_errno has the right number of arguments')
      })

      // llhttp_get_error_reason
      test('instance.exports.llhttp_get_error_reason', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_get_error_reason === 'function', 'llhttp_get_error_reason is present')
        t.strictEqual(instance.exports.llhttp_get_error_reason.length, 1, 'llhttp_get_error_reason has the right number of arguments')
      })

      // llhttp_set_error_reason
      test('instance.exports.llhttp_set_error_reason', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_set_error_reason === 'function', 'llhttp_set_error_reason is present')
        t.strictEqual(instance.exports.llhttp_set_error_reason.length, 2, 'llhttp_set_error_reason has the right number of arguments')
      })

      // llhttp_get_error_pos
      test('instance.exports.llhttp_get_error_pos', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_get_error_pos === 'function', 'llhttp_get_error_pos is present')
        t.strictEqual(instance.exports.llhttp_get_error_pos.length, 1, 'llhttp_get_error_pos has the right number of arguments')
      })

      // llhttp_errno_name
      test('instance.exports.llhttp_errno_name', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_errno_name === 'function', 'llhttp_errno_name is present')
        t.strictEqual(instance.exports.llhttp_errno_name.length, 1, 'llhttp_errno_name has the right number of arguments')
      })

      // llhttp_method_name
      test('instance.exports.llhttp_method_name', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_method_name === 'function', 'llhttp_method_name is present')
        t.strictEqual(instance.exports.llhttp_method_name.length, 1, 'llhttp_method_name has the right number of arguments')
      })

      // llhttp_status_name
      test('instance.exports.llhttp_status_name', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_status_name === 'function', 'llhttp_status_name is present')
        t.strictEqual(instance.exports.llhttp_status_name.length, 1, 'llhttp_status_name has the right number of arguments')
      })

      // llhttp_set_lenient_headers
      test('instance.exports.llhttp_set_lenient_headers', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_set_lenient_headers === 'function', 'llhttp_set_lenient_headers is present')
        t.strictEqual(instance.exports.llhttp_set_lenient_headers.length, 2, 'llhttp_set_lenient_headers has the right number of arguments')
      })

      // llhttp_set_lenient_chunked_length
      test('instance.exports.llhttp_set_lenient_chunked_length', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_set_lenient_chunked_length === 'function', 'llhttp_set_lenient_chunked_length is present')
        t.strictEqual(instance.exports.llhttp_set_lenient_chunked_length.length, 2, 'llhttp_set_lenient_chunked_length has the right number of arguments')
      })

      // llhttp_set_lenient_keep_alive
      test('instance.exports.llhttp_set_lenient_keep_alive', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_set_lenient_keep_alive === 'function', 'llhttp_set_lenient_keep_alive is present')
        t.strictEqual(instance.exports.llhttp_set_lenient_keep_alive.length, 2, 'llhttp_set_lenient_keep_alive has the right number of arguments')
      })

      // llhttp_set_lenient_transfer_encoding
      test('instance.exports.llhttp_set_lenient_transfer_encoding', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_set_lenient_transfer_encoding === 'function', 'llhttp_set_lenient_transfer_encoding is present')
        t.strictEqual(instance.exports.llhttp_set_lenient_transfer_encoding.length, 2, 'llhttp_set_lenient_transfer_encoding has the right number of arguments')
      })

      // llhttp_message_needs_eof
      test('instance.exports.llhttp_message_needs_eof', async (t) => {
        t = tspl(t, { plan: 2 })

        t.ok(typeof instance.exports.llhttp_message_needs_eof === 'function', 'llhttp_message_needs_eof is present')
        t.strictEqual(instance.exports.llhttp_message_needs_eof.length, 1, 'llhttp_message_needs_eof has the right number of arguments')
      })
    })
  })
})
