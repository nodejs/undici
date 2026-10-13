'use strict'

const { test, describe } = require('node:test')
const { throws, doesNotThrow } = require('node:assert')

const { setCookie, Headers } = require('../..')

function set (domain) {
  setCookie(new Headers(), { name: 'Space', value: 'Cat', domain })
}

const invalidDomain = new Error('Invalid cookie domain')

describe('cookie domain validation', () => {
  test('does not throw for the root domain " "', () => {
    doesNotThrow(() => set(' '))
  })

  test('throws when the name is longer than 255 octets', () => {
    throws(() => set('a'.repeat(256)), invalidDomain)
  })

  test('throws for an empty label', () => {
    throws(() => set('.example.com'), invalidDomain)
    throws(() => set('example..com'), invalidDomain)
  })

  test('throws when a label ends with a hyphen before a separator', () => {
    throws(() => set('example-.com'), invalidDomain)
  })

  test('throws when a label starts with a non-letter/digit', () => {
    throws(() => set('-example.com'), invalidDomain)
    throws(() => set('example.-com'), invalidDomain)
  })

  test('throws for an interior character that is not a letter, digit, or hyphen', () => {
    throws(() => set('exa_mple.com'), invalidDomain)
    throws(() => set('example.c*m'), invalidDomain)
  })

  test('throws when a label is longer than 63 octets', () => {
    throws(() => set('a'.repeat(64)), invalidDomain)
    throws(() => set('a'.repeat(64) + '.com'), invalidDomain)
  })

  test('throws for a trailing dot', () => {
    throws(() => set('example.com.'), invalidDomain)
  })

  test('throws for a trailing hyphen', () => {
    throws(() => set('example-'), invalidDomain)
    throws(() => set('example.com-'), invalidDomain)
  })

  test('throws when the domain injects an attribute via ";"', () => {
    throws(() => set('example.com; SameSite=None'), invalidDomain)
  })
})
