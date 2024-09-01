'use strict'

const { test } = require('node:test')
const assert = require('node:assert')
const { tspl } = require('@matteo.collina/tspl')
const { FormData, Response, Request } = require('../../')
const { Blob, File } = require('node:buffer')
const { isFormDataLike } = require('../../lib/core/util')

test('arg validation', () => {
  const form = new FormData()

  // constructor
  assert.throws(() => {
    // eslint-disable-next-line
    new FormData('asd')
  }, TypeError)

  // append
  assert.throws(() => {
    FormData.prototype.append.call(null)
  }, TypeError)
  assert.throws(() => {
    form.append()
  }, TypeError)
  assert.throws(() => {
    form.append('k', 'not usv', '')
  }, TypeError)

  // delete
  assert.throws(() => {
    FormData.prototype.delete.call(null)
  }, TypeError)
  assert.throws(() => {
    form.delete()
  }, TypeError)

  // get
  assert.throws(() => {
    FormData.prototype.get.call(null)
  }, TypeError)
  assert.throws(() => {
    form.get()
  }, TypeError)

  // getAll
  assert.throws(() => {
    FormData.prototype.getAll.call(null)
  }, TypeError)
  assert.throws(() => {
    form.getAll()
  }, TypeError)

  // has
  assert.throws(() => {
    FormData.prototype.has.call(null)
  }, TypeError)
  assert.throws(() => {
    form.has()
  }, TypeError)

  // set
  assert.throws(() => {
    FormData.prototype.set.call(null)
  }, TypeError)
  assert.throws(() => {
    form.set('k')
  }, TypeError)
  assert.throws(() => {
    form.set('k', 'not usv', '')
  }, TypeError)

  // iterator
  assert.throws(() => {
    Reflect.apply(FormData.prototype[Symbol.iterator], null)
  }, TypeError)

  // toStringTag
  assert.doesNotThrow(() => {
    FormData.prototype[Symbol.toStringTag].charAt(0)
  })
})

test('set blob', () => {
  const form = new FormData()

  form.set('key', new Blob([]), undefined)
  assert.strictEqual(form.get('key').name, 'blob')

  form.set('key1', new Blob([]), null)
  assert.strictEqual(form.get('key1').name, 'null')
})

test('append file', () => {
  const form = new FormData()
  form.set('asd', new File([], 'asd1', { type: 'text/plain' }), 'asd2')
  form.append('asd2', new File([], 'asd1'), 'asd2')

  assert.strictEqual(form.has('asd'), true)
  assert.strictEqual(form.has('asd2'), true)
  assert.strictEqual(form.get('asd').name, 'asd2')
  assert.strictEqual(form.get('asd2').name, 'asd2')
  assert.strictEqual(form.get('asd').type, 'text/plain')
  form.delete('asd')
  assert.strictEqual(form.get('asd'), null)
  assert.strictEqual(form.has('asd2'), true)
  assert.strictEqual(form.has('asd'), false)
})

test('append blob', async () => {
  const form = new FormData()
  form.set('asd', new Blob(['asd1'], { type: 'text/plain' }))

  assert.strictEqual(form.has('asd'), true)
  assert.strictEqual(form.get('asd').type, 'text/plain')
  assert.strictEqual(await form.get('asd').text(), 'asd1')
  form.delete('asd')
  assert.strictEqual(form.get('asd'), null)

  form.append('key', new Blob([]), undefined)
  assert.strictEqual(form.get('key').name, 'blob')

  form.append('key1', new Blob([]), null)
  assert.strictEqual(form.get('key1').name, 'null')
})

test('append string', () => {
  const form = new FormData()
  form.set('k1', 'v1')
  form.set('k2', 'v2')
  assert.deepStrictEqual([...form], [['k1', 'v1'], ['k2', 'v2']])
  assert.strictEqual(form.has('k1'), true)
  assert.strictEqual(form.get('k1'), 'v1')
  form.append('k1', 'v1+')
  assert.deepStrictEqual(form.getAll('k1'), ['v1', 'v1+'])
  form.set('k2', 'v1++')
  assert.strictEqual(form.get('k2'), 'v1++')
  form.delete('asd')
  assert.strictEqual(form.get('asd'), null)
})

test('formData.entries', async (t) => {
  const form = new FormData()

  await t.test('with 0 entries', (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 1 })

    const entries = [...form.entries()]
    deepStrictEqual(entries, [])
  })

  await t.test('with 1+ entries', (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 2 })

    form.set('k1', 'v1')
    form.set('k2', 'v2')

    const entries = [...form.entries()]
    const entries2 = [...form.entries()]
    deepStrictEqual(entries, [['k1', 'v1'], ['k2', 'v2']])
    deepStrictEqual(entries, entries2)
  })
})

test('formData.keys', async (t) => {
  const form = new FormData()

  await t.test('with 0 keys', (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 1 })

    const keys = [...form.entries()]
    deepStrictEqual(keys, [])
  })

  await t.test('with 1+ keys', (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 2 })

    form.set('k1', 'v1')
    form.set('k2', 'v2')

    const keys = [...form.keys()]
    const keys2 = [...form.keys()]
    deepStrictEqual(keys, ['k1', 'k2'])
    deepStrictEqual(keys, keys2)
  })
})

test('formData.values', async (t) => {
  const form = new FormData()

  await t.test('with 0 values', (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 1 })

    const values = [...form.values()]
    deepStrictEqual(values, [])
  })

  await t.test('with 1+ values', (t) => {
    const { deepStrictEqual } = tspl(t, { plan: 2 })

    form.set('k1', 'v1')
    form.set('k2', 'v2')

    const values = [...form.values()]
    const values2 = [...form.values()]
    deepStrictEqual(values, ['v1', 'v2'])
    deepStrictEqual(values, values2)
  })
})

test('formData forEach', async (t) => {
  await t.test('invalid arguments', () => {
    assert.throws(() => {
      FormData.prototype.forEach.call({})
    }, TypeError('Illegal invocation'))

    assert.throws(() => {
      const fd = new FormData()

      fd.forEach({})
    }, TypeError)
  })

  await t.test('with a callback', () => {
    const fd = new FormData()

    fd.set('a', 'b')
    fd.set('c', 'd')

    let i = 0
    fd.forEach((value, key, self) => {
      if (i++ === 0) {
        assert.strictEqual(value, 'b')
        assert.strictEqual(key, 'a')
      } else {
        assert.strictEqual(value, 'd')
        assert.strictEqual(key, 'c')
      }

      assert.strictEqual(fd, self)
    })
  })

  await t.test('with a thisArg', () => {
    const fd = new FormData()
    fd.set('b', 'a')

    fd.forEach(function (value, key, self) {
      assert.strictEqual(this, globalThis)
      assert.strictEqual(fd, self)
      assert.strictEqual(key, 'b')
      assert.strictEqual(value, 'a')
    })

    const thisArg = Symbol('thisArg')
    fd.forEach(function () {
      assert.strictEqual(this, thisArg)
    }, thisArg)
  })
})

test('formData toStringTag', () => {
  const form = new FormData()
  assert.strictEqual(form[Symbol.toStringTag], 'FormData')
  assert.strictEqual(FormData.prototype[Symbol.toStringTag], 'FormData')
})

test('formData.constructor.name', () => {
  const form = new FormData()
  assert.strictEqual(form.constructor.name, 'FormData')
})

test('formData should be an instance of FormData', async (t) => {
  await t.test('Invalid class FormData', () => {
    class FormData {
      constructor () {
        this.data = []
      }

      append (key, value) {
        this.data.push([key, value])
      }

      get (key) {
        return this.data.find(([k]) => k === key)
      }
    }

    const form = new FormData()
    assert.strictEqual(isFormDataLike(form), false)
  })

  await t.test('Invalid function FormData', () => {
    function FormData () {
      const data = []
      return {
        append (key, value) {
          data.push([key, value])
        },
        get (key) {
          return data.find(([k]) => k === key)
        }
      }
    }

    const form = new FormData()
    assert.strictEqual(isFormDataLike(form), false)
  })

  await t.test('Valid FormData', () => {
    const form = new FormData()
    assert.strictEqual(isFormDataLike(form), true)
  })
})

test('FormData should be compatible with third-party libraries', (t) => {
  const { strictEqual } = tspl(t, { plan: 1 })

  class FormData {
    constructor () {
      this.data = []
    }

    get [Symbol.toStringTag] () {
      return 'FormData'
    }

    append () {}
    delete () {}
    get () {}
    getAll () {}
    has () {}
    set () {}
    entries () {}
    keys () {}
    values () {}
    forEach () {}
  }

  const form = new FormData()
  strictEqual(isFormDataLike(form), true)
})

test('arguments', () => {
  assert.strictEqual(FormData.constructor.length, 1)
  assert.strictEqual(FormData.prototype.append.length, 2)
  assert.strictEqual(FormData.prototype.delete.length, 1)
  assert.strictEqual(FormData.prototype.get.length, 1)
  assert.strictEqual(FormData.prototype.getAll.length, 1)
  assert.strictEqual(FormData.prototype.has.length, 1)
  assert.strictEqual(FormData.prototype.set.length, 2)
})

// https://github.com/nodejs/undici/pull/1814
test('FormData returned from bodyMixin.formData is not a clone', async () => {
  const fd = new FormData()
  fd.set('foo', 'bar')

  const res = new Response(fd)
  fd.set('foo', 'foo')

  const fd2 = await res.formData()

  assert.strictEqual(fd2.get('foo'), 'bar')
  assert.strictEqual(fd.get('foo'), 'foo')

  fd2.set('foo', 'baz')

  assert.strictEqual(fd2.get('foo'), 'baz')
  assert.strictEqual(fd.get('foo'), 'foo')
})

test('.formData() with multipart/form-data body that ends with --\r\n', async (t) => {
  const request = new Request('http://localhost', {
    method: 'POST',
    headers: {
      'Content-Type': 'multipart/form-data; boundary=----formdata-undici-0.6204674738279623'
    },
    body:
      '------formdata-undici-0.6204674738279623\r\n' +
      'Content-Disposition: form-data; name="fiŝo"\r\n' +
      '\r\n' +
      'value1\r\n' +
      '------formdata-undici-0.6204674738279623--\r\n'
  })

  await request.formData()
})
