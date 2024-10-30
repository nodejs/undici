'use strict'

// (The MIT License)
//
// Copyright (c) 2012-2014 Roman Shtylman <shtylman@gmail.com>
// Copyright (c) 2015 Douglas Christopher Wilson <doug@somethingdoug.com>
//
// Permission is hereby granted, free of charge, to any person obtaining
// a copy of this software and associated documentation files (the
// 'Software'), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to
// permit persons to whom the Software is furnished to do so, subject to
// the following conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
// IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
// CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
// TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
// SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

const { describe, it } = require('node:test')
const assert = require('node:assert')
const { parseCookie } = require('../..')

describe('parseCookie(str)', function () {
  it('should parse cookie string to object', function () {
    assert.deepStrictEqual(parseCookie('foo=bar'), { name: 'foo', value: 'bar' })
    assert.deepStrictEqual(parseCookie('foo=123'), { name: 'foo', value: '123' })
  })

  it('should ignore OWS', function () {
    assert.deepStrictEqual(parseCookie('FOO    = bar;   baz  =   raz'), {
      name: 'FOO',
      value: 'bar',
      unparsed: ['baz=raz']
    })
  })

  it('should parse cookie with empty value', function () {
    assert.deepStrictEqual(parseCookie('foo=; bar='), { name: 'foo', value: '', unparsed: ['bar='] })
  })

  it('should parse cookie with minimum length', function () {
    assert.deepStrictEqual(parseCookie('f='), { name: 'f', value: '' })
    assert.deepStrictEqual(parseCookie('f=;b='), { name: 'f', value: '', unparsed: ['b='] })
  })

  it('should URL-decode values', function () {
    assert.deepStrictEqual(parseCookie('foo="bar=123456789&name=Magic+Mouse"'), {
      name: 'foo',
      value: '"bar=123456789&name=Magic+Mouse"'
    })

    assert.deepStrictEqual(parseCookie('email=%20%22%2c%3b%2f'), { name: 'email', value: ' ",;/' })
  })

  it('should trim whitespace around key and value', function () {
    assert.deepStrictEqual(parseCookie('  foo  =  "bar"  '), { name: 'foo', value: '"bar"' })
    assert.deepStrictEqual(parseCookie('  foo  =  bar  ;  fizz  =  buzz  '), {
      name: 'foo',
      value: 'bar',
      unparsed: ['fizz=buzz']
    })
    assert.deepStrictEqual(parseCookie(' foo = " a b c " '), { name: 'foo', value: '" a b c "' })
    assert.deepStrictEqual(parseCookie(' = bar '), { name: '', value: 'bar' })
    assert.deepStrictEqual(parseCookie(' foo = '), { name: 'foo', value: '' })
    assert.deepStrictEqual(parseCookie('   =   '), { name: '', value: '' })
    assert.deepStrictEqual(parseCookie('\tfoo\t=\tbar\t'), { name: 'foo', value: 'bar' })
  })

  it('should return original value on escape error', function () {
    assert.deepStrictEqual(parseCookie('foo=%1;bar=bar'), { name: 'foo', value: '%1', unparsed: ['bar=bar'] })
  })

  it('should ignore cookies without value', function () {
    assert.deepStrictEqual(parseCookie('foo=bar;fizz  ;  buzz'), { name: 'foo', value: 'bar', unparsed: ['fizz=', 'buzz='] })
    assert.deepStrictEqual(parseCookie('  fizz; foo=  bar'), { name: '', value: 'fizz', unparsed: ['foo=bar'] })
  })

  it('should ignore duplicate cookies', function () {
    assert.deepStrictEqual(parseCookie('foo=%1;bar=bar;foo=boo'), {
      name: 'foo',
      value: '%1',
      unparsed: ['bar=bar', 'foo=boo']
    })
    assert.deepStrictEqual(parseCookie('foo=false;bar=bar;foo=true'), {
      name: 'foo',
      value: 'false',
      unparsed: ['bar=bar', 'foo=true']
    })
    assert.deepStrictEqual(parseCookie('foo=;bar=bar;foo=boo'), {
      name: 'foo',
      value: '',
      unparsed: ['bar=bar', 'foo=boo']
    })
  })

  it('should parse native properties', function () {
    assert.deepStrictEqual(parseCookie('toString=foo;valueOf=bar'), {
      name: 'toString',
      unparsed: [
        'valueOf=bar'
      ],
      value: 'foo'
    })
  })
})
