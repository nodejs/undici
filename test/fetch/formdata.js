'use strict'

const { test } = require('tap')
const { FormData, File, Response } = require('../../')
const { Blob: ThirdPartyBlob } = require('formdata-node')
const { Blob } = require('buffer')
const { isFormDataLike } = require('../../lib/core/util')
const ThirdPartyFormDataInvalid = require('form-data')

test('arg validation', (t) => {
  const form = new FormData()

  // constructor
  t.throws(() => {
    // eslint-disable-next-line
    new FormData('asd')
  }, TypeError)

  // append
  t.throws(() => {
    FormData.prototype.append.call(null)
  }, TypeError)
  t.throws(() => {
    form.append()
  }, TypeError)
  t.throws(() => {
    form.append('k', 'not usv', '')
  }, TypeError)

  // delete
  t.throws(() => {
    FormData.prototype.delete.call(null)
  }, TypeError)
  t.throws(() => {
    form.delete()
  }, TypeError)

  // get
  t.throws(() => {
    FormData.prototype.get.call(null)
  }, TypeError)
  t.throws(() => {
    form.get()
  }, TypeError)

  // getAll
  t.throws(() => {
    FormData.prototype.getAll.call(null)
  }, TypeError)
  t.throws(() => {
    form.getAll()
  }, TypeError)

  // has
  t.throws(() => {
    FormData.prototype.has.call(null)
  }, TypeError)
  t.throws(() => {
    form.has()
  }, TypeError)

  // set
  t.throws(() => {
    FormData.prototype.set.call(null)
  }, TypeError)
  t.throws(() => {
    form.set('k')
  }, TypeError)
  t.throws(() => {
    form.set('k', 'not usv', '')
  }, TypeError)

  // iterator
  t.throws(() => {
    Reflect.apply(FormData.prototype[Symbol.iterator], null)
  }, TypeError)

  // toStringTag
  t.doesNotThrow(() => {
    FormData.prototype[Symbol.toStringTag].charAt(0)
  })

  t.end()
})

test('append file', (t) => {
  const form = new FormData()
  form.set('asd', new File([], 'asd1', { type: 'text/plain' }), 'asd2')
  form.append('asd2', new File([], 'asd1'), 'asd2')

  t.equal(form.has('asd'), true)
  t.equal(form.has('asd2'), true)
  t.equal(form.get('asd').name, 'asd2')
  t.equal(form.get('asd2').name, 'asd2')
  t.equal(form.get('asd').type, 'text/plain')
  form.delete('asd')
  t.equal(form.get('asd'), null)
  t.equal(form.has('asd2'), true)
  t.equal(form.has('asd'), false)

  t.end()
})

test('append blob', async (t) => {
  const form = new FormData()
  form.set('asd', new Blob(['asd1'], { type: 'text/plain' }))

  t.equal(form.has('asd'), true)
  t.equal(form.get('asd').type, 'text/plain')
  t.equal(await form.get('asd').text(), 'asd1')
  form.delete('asd')
  t.equal(form.get('asd'), null)

  t.end()
})

test('append third-party blob', async (t) => {
  const form = new FormData()
  form.set('asd', new ThirdPartyBlob(['asd1'], { type: 'text/plain' }))

  t.equal(form.has('asd'), true)
  t.equal(form.get('asd').type, 'text/plain')
  t.equal(await form.get('asd').text(), 'asd1')
  form.delete('asd')
  t.equal(form.get('asd'), null)

  t.end()
})

test('append string', (t) => {
  const form = new FormData()
  form.set('k1', 'v1')
  form.set('k2', 'v2')
  t.same([...form], [['k1', 'v1'], ['k2', 'v2']])
  t.equal(form.has('k1'), true)
  t.equal(form.get('k1'), 'v1')
  form.append('k1', 'v1+')
  t.same(form.getAll('k1'), ['v1', 'v1+'])
  form.set('k2', 'v1++')
  t.equal(form.get('k2'), 'v1++')
  form.delete('asd')
  t.equal(form.get('asd'), null)
  t.end()
})

test('formData.entries', (t) => {
  t.plan(2)
  const form = new FormData()

  t.test('with 0 entries', (t) => {
    t.plan(1)

    const entries = [...form.entries()]
    t.same(entries, [])
  })

  t.test('with 1+ entries', (t) => {
    t.plan(2)

    form.set('k1', 'v1')
    form.set('k2', 'v2')

    const entries = [...form.entries()]
    const entries2 = [...form.entries()]
    t.same(entries, [['k1', 'v1'], ['k2', 'v2']])
    t.same(entries, entries2)
  })
})

test('formData.keys', (t) => {
  t.plan(2)
  const form = new FormData()

  t.test('with 0 keys', (t) => {
    t.plan(1)

    const keys = [...form.entries()]
    t.same(keys, [])
  })

  t.test('with 1+ keys', (t) => {
    t.plan(2)

    form.set('k1', 'v1')
    form.set('k2', 'v2')

    const keys = [...form.keys()]
    const keys2 = [...form.keys()]
    t.same(keys, ['k1', 'k2'])
    t.same(keys, keys2)
  })
})

test('formData.values', (t) => {
  t.plan(2)
  const form = new FormData()

  t.test('with 0 values', (t) => {
    t.plan(1)

    const values = [...form.values()]
    t.same(values, [])
  })

  t.test('with 1+ values', (t) => {
    t.plan(2)

    form.set('k1', 'v1')
    form.set('k2', 'v2')

    const values = [...form.values()]
    const values2 = [...form.values()]
    t.same(values, ['v1', 'v2'])
    t.same(values, values2)
  })
})

test('formData forEach', (t) => {
  t.test('invalid arguments', (t) => {
    t.throws(() => {
      FormData.prototype.forEach.call({})
    }, TypeError('Illegal invocation'))

    t.throws(() => {
      const fd = new FormData()

      fd.forEach({})
    }, TypeError)

    t.end()
  })

  t.test('with a callback', (t) => {
    const fd = new FormData()

    fd.set('a', 'b')
    fd.set('c', 'd')

    let i = 0
    fd.forEach((value, key, self) => {
      if (i++ === 0) {
        t.equal(value, 'b')
        t.equal(key, 'a')
      } else {
        t.equal(value, 'd')
        t.equal(key, 'c')
      }

      t.equal(fd, self)
    })

    t.end()
  })

  t.test('with a thisArg', (t) => {
    const fd = new FormData()
    fd.set('b', 'a')

    fd.forEach(function (value, key, self) {
      t.equal(this, globalThis)
      t.equal(fd, self)
      t.equal(key, 'b')
      t.equal(value, 'a')
    })

    const thisArg = Symbol('thisArg')
    fd.forEach(function () {
      t.equal(this, thisArg)
    }, thisArg)

    t.end()
  })

  t.end()
})

test('formData toStringTag', (t) => {
  const form = new FormData()
  t.equal(form[Symbol.toStringTag], 'FormData')
  t.equal(FormData.prototype[Symbol.toStringTag], 'FormData')
  t.end()
})

test('formData.constructor.name', (t) => {
  const form = new FormData()
  t.equal(form.constructor.name, 'FormData')
  t.end()
})

test('formData should be an instance of FormData', (t) => {
  t.plan(3)

  t.test('Invalid class FormData', (t) => {
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
    t.equal(isFormDataLike(form), false)
    t.end()
  })

  t.test('Invalid function FormData', (t) => {
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
    t.equal(isFormDataLike(form), false)
    t.end()
  })

  test('Invalid third-party FormData', (t) => {
    const form = new ThirdPartyFormDataInvalid()
    t.equal(isFormDataLike(form), false)
    t.end()
  })

  t.test('Valid FormData', (t) => {
    const form = new FormData()
    t.equal(isFormDataLike(form), true)
    t.end()
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
  t.equal(isFormDataLike(form), true)
})

test('arguments', (t) => {
  t.equal(FormData.constructor.length, 1)
  t.equal(FormData.prototype.append.length, 2)
  t.equal(FormData.prototype.delete.length, 1)
  t.equal(FormData.prototype.get.length, 1)
  t.equal(FormData.prototype.getAll.length, 1)
  t.equal(FormData.prototype.has.length, 1)
  t.equal(FormData.prototype.set.length, 2)

  t.end()
})

// https://github.com/nodejs/undici/pull/1814
test('FormData returned from bodyMixin.formData is not a clone', async (t) => {
  const fd = new FormData()
  fd.set('foo', 'bar')

  const res = new Response(fd)
  fd.set('foo', 'foo')

  const fd2 = await res.formData()

  t.equal(fd2.get('foo'), 'bar')
  t.equal(fd.get('foo'), 'foo')

  fd2.set('foo', 'baz')

  t.equal(fd2.get('foo'), 'baz')
  t.equal(fd.get('foo'), 'foo')
})
