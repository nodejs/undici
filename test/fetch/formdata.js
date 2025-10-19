'use strict'

const { test } = require('node:test')
const { FormData, Response, Request } = require('../../')
const { isFormDataLike } = require('../../lib/core/util')

test('arg validation', (t) => {
  const form = new FormData()

  // constructor
  t.assert.throws(() => {
    // eslint-disable-next-line
    new FormData('asd')
  }, TypeError)

  // append
  t.assert.throws(() => {
    FormData.prototype.append.call(null)
  }, TypeError)
  t.assert.throws(() => {
    form.append()
  }, TypeError)
  t.assert.throws(() => {
    form.append('k', 'not usv', '')
  }, TypeError)

  // delete
  t.assert.throws(() => {
    FormData.prototype.delete.call(null)
  }, TypeError)
  t.assert.throws(() => {
    form.delete()
  }, TypeError)

  // get
  t.assert.throws(() => {
    FormData.prototype.get.call(null)
  }, TypeError)
  t.assert.throws(() => {
    form.get()
  }, TypeError)

  // getAll
  t.assert.throws(() => {
    FormData.prototype.getAll.call(null)
  }, TypeError)
  t.assert.throws(() => {
    form.getAll()
  }, TypeError)

  // has
  t.assert.throws(() => {
    FormData.prototype.has.call(null)
  }, TypeError)
  t.assert.throws(() => {
    form.has()
  }, TypeError)

  // set
  t.assert.throws(() => {
    FormData.prototype.set.call(null)
  }, TypeError)
  t.assert.throws(() => {
    form.set('k')
  }, TypeError)
  t.assert.throws(() => {
    form.set('k', 'not usv', '')
  }, TypeError)

  // iterator
  t.assert.throws(() => {
    Reflect.apply(FormData.prototype[Symbol.iterator], null)
  }, TypeError)

  // toStringTag
  t.assert.doesNotThrow(() => {
    FormData.prototype[Symbol.toStringTag].charAt(0)
  })
})

test('set blob', (t) => {
  const form = new FormData()

  form.set('key', new Blob([]), undefined)
  t.assert.strictEqual(form.get('key').name, 'blob')

  form.set('key1', new Blob([]), null)
  t.assert.strictEqual(form.get('key1').name, 'null')
})

test('append file', (t) => {
  const form = new FormData()
  form.set('asd', new File([], 'asd1', { type: 'text/plain' }), 'asd2')
  form.append('asd2', new File([], 'asd1'), 'asd2')

  t.assert.strictEqual(form.has('asd'), true)
  t.assert.strictEqual(form.has('asd2'), true)
  t.assert.strictEqual(form.get('asd').name, 'asd2')
  t.assert.strictEqual(form.get('asd2').name, 'asd2')
  t.assert.strictEqual(form.get('asd').type, 'text/plain')
  form.delete('asd')
  t.assert.strictEqual(form.get('asd'), null)
  t.assert.strictEqual(form.has('asd2'), true)
  t.assert.strictEqual(form.has('asd'), false)
})

test('append blob', async (t) => {
  const form = new FormData()
  form.set('asd', new Blob(['asd1'], { type: 'text/plain' }))

  t.assert.strictEqual(form.has('asd'), true)
  t.assert.strictEqual(form.get('asd').type, 'text/plain')
  t.assert.strictEqual(await form.get('asd').text(), 'asd1')
  form.delete('asd')
  t.assert.strictEqual(form.get('asd'), null)

  form.append('key', new Blob([]), undefined)
  t.assert.strictEqual(form.get('key').name, 'blob')

  form.append('key1', new Blob([]), null)
  t.assert.strictEqual(form.get('key1').name, 'null')
})

test('append string', (t) => {
  const form = new FormData()
  form.set('k1', 'v1')
  form.set('k2', 'v2')
  t.assert.deepStrictEqual([...form], [['k1', 'v1'], ['k2', 'v2']])
  t.assert.strictEqual(form.has('k1'), true)
  t.assert.strictEqual(form.get('k1'), 'v1')
  form.append('k1', 'v1+')
  t.assert.deepStrictEqual(form.getAll('k1'), ['v1', 'v1+'])
  form.set('k2', 'v1++')
  t.assert.strictEqual(form.get('k2'), 'v1++')
  form.delete('asd')
  t.assert.strictEqual(form.get('asd'), null)
})

test('formData.entries', async (t) => {
  const form = new FormData()

  await t.test('with 0 entries', (t) => {
    t.plan(1)

    const entries = [...form.entries()]
    t.assert.deepStrictEqual(entries, [])
  })

  await t.test('with 1+ entries', (t) => {
    t.plan(2)

    form.set('k1', 'v1')
    form.set('k2', 'v2')

    const entries = [...form.entries()]
    const entries2 = [...form.entries()]
    t.assert.deepStrictEqual(entries, [['k1', 'v1'], ['k2', 'v2']])
    t.assert.deepStrictEqual(entries, entries2)
  })
})

test('formData.keys', async (t) => {
  const form = new FormData()

  await t.test('with 0 keys', (t) => {
    t.plan(1)

    const keys = [...form.entries()]
    t.assert.deepStrictEqual(keys, [])
  })

  await t.test('with 1+ keys', (t) => {
    t.plan(2)

    form.set('k1', 'v1')
    form.set('k2', 'v2')

    const keys = [...form.keys()]
    const keys2 = [...form.keys()]
    t.assert.deepStrictEqual(keys, ['k1', 'k2'])
    t.assert.deepStrictEqual(keys, keys2)
  })
})

test('formData.values', async (t) => {
  const form = new FormData()

  await t.test('with 0 values', (t) => {
    t.plan(1)

    const values = [...form.values()]
    t.assert.deepStrictEqual(values, [])
  })

  await t.test('with 1+ values', (t) => {
    t.plan(2)

    form.set('k1', 'v1')
    form.set('k2', 'v2')

    const values = [...form.values()]
    const values2 = [...form.values()]
    t.assert.deepStrictEqual(values, ['v1', 'v2'])
    t.assert.deepStrictEqual(values, values2)
  })
})

test('formData forEach', async (t) => {
  await t.test('invalid arguments', (t) => {
    t.assert.throws(() => {
      FormData.prototype.forEach.call({})
    }, TypeError('Illegal invocation'))

    t.assert.throws(() => {
      const fd = new FormData()

      fd.forEach({})
    }, TypeError)
  })

  await t.test('with a callback', (t) => {
    const fd = new FormData()

    fd.set('a', 'b')
    fd.set('c', 'd')

    let i = 0
    fd.forEach((value, key, self) => {
      if (i++ === 0) {
        t.assert.strictEqual(value, 'b')
        t.assert.strictEqual(key, 'a')
      } else {
        t.assert.strictEqual(value, 'd')
        t.assert.strictEqual(key, 'c')
      }

      t.assert.strictEqual(fd, self)
    })
  })

  await t.test('with a thisArg', (t) => {
    const fd = new FormData()
    fd.set('b', 'a')

    fd.forEach(function (value, key, self) {
      t.assert.strictEqual(this, globalThis)
      t.assert.strictEqual(fd, self)
      t.assert.strictEqual(key, 'b')
      t.assert.strictEqual(value, 'a')
    })

    const thisArg = Symbol('thisArg')
    fd.forEach(function () {
      t.assert.strictEqual(this, thisArg)
    }, thisArg)
  })
})

test('formData toStringTag', (t) => {
  const form = new FormData()
  t.assert.strictEqual(form[Symbol.toStringTag], 'FormData')
  t.assert.strictEqual(FormData.prototype[Symbol.toStringTag], 'FormData')
})

test('formData.constructor.name', (t) => {
  const form = new FormData()
  t.assert.strictEqual(form.constructor.name, 'FormData')
})

test('formData should be an instance of FormData', async (t) => {
  await t.test('Invalid class FormData', (t) => {
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
    t.assert.strictEqual(isFormDataLike(form), false)
  })

  await t.test('Invalid function FormData', (t) => {
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
    t.assert.strictEqual(isFormDataLike(form), false)
  })

  await t.test('Valid FormData', (t) => {
    const form = new FormData()
    t.assert.strictEqual(isFormDataLike(form), true)
  })
})

test('FormData should be compatible with third-party libraries', (t) => {
  t.plan(1)

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
  t.assert.strictEqual(isFormDataLike(form), true)
})

test('arguments', (t) => {
  t.assert.strictEqual(FormData.length, 0)
  t.assert.strictEqual(FormData.prototype.append.length, 2)
  t.assert.strictEqual(FormData.prototype.delete.length, 1)
  t.assert.strictEqual(FormData.prototype.get.length, 1)
  t.assert.strictEqual(FormData.prototype.getAll.length, 1)
  t.assert.strictEqual(FormData.prototype.has.length, 1)
  t.assert.strictEqual(FormData.prototype.set.length, 2)
})

// https://github.com/nodejs/undici/pull/1814
test('FormData returned from bodyMixin.formData is not a clone', async (t) => {
  const fd = new FormData()
  fd.set('foo', 'bar')

  const res = new Response(fd)
  fd.set('foo', 'foo')

  const fd2 = await res.formData()

  t.assert.strictEqual(fd2.get('foo'), 'bar')
  t.assert.strictEqual(fd.get('foo'), 'foo')

  fd2.set('foo', 'baz')

  t.assert.strictEqual(fd2.get('foo'), 'baz')
  t.assert.strictEqual(fd.get('foo'), 'foo')
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
