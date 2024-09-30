'use strict'

const { tspl } = require('@matteo.collina/tspl')
const { describe, test, beforeEach } = require('node:test')
const { MockAgent, fetch, setGlobalDispatcher, getGlobalDispatcher } = require('..')

describe('https://github.com/nodejs/undici/issues/3649', () => {
  const undiciGlobalDispatcher = getGlobalDispatcher()
  if (!undiciGlobalDispatcher) throw new Error('Could not find the global Undici dispatcher')

  let mockAgent

  beforeEach(() => {
    mockAgent = new MockAgent()
    mockAgent.disableNetConnect()
    setGlobalDispatcher(mockAgent)
  })

  test('MockAgent should match with or without trailing slash /1', async (t) => {
    t = tspl(t, { plan: 1 })

    mockAgent
      .get('https://localhost')
      .intercept({ path: '/api/some-path' }).reply(200, { ok: true })

    const res = await fetch(new URL('/api/some-path', 'https://localhost'))

    t.deepStrictEqual(await res.json(), { ok: true })
  })

  test('MockAgent should match with or without trailing slash /2', async (t) => {
    t = tspl(t, { plan: 1 })

    mockAgent
      .get('https://localhost')
      .intercept({ path: '/api/some-path' }).reply(200, { ok: true })

    const res = await fetch(new URL('/api/some-path/', 'https://localhost'))

    t.deepStrictEqual(await res.json(), { ok: true })
  })

  test('MockAgent should match with or without trailing slash /3', async (t) => {
    t = tspl(t, { plan: 1 })

    mockAgent
      .get('https://localhost')
      .intercept({ path: '/api/some-path/' }).reply(200, { ok: true })

    const res = await fetch(new URL('/api/some-path', 'https://localhost'))

    t.deepStrictEqual(await res.json(), { ok: true })
  })

  test('MockAgent should match with or without trailing slash /4', async (t) => {
    t = tspl(t, { plan: 1 })

    mockAgent
      .get('https://localhost')
      .intercept({ path: '/api/some-path/' }).reply(200, { ok: true })

    const res = await fetch(new URL('/api/some-path/', 'https://localhost'))

    t.deepStrictEqual(await res.json(), { ok: true })
  })

  test('MockAgent should match with or without trailing slash /5', async (t) => {
    t = tspl(t, { plan: 1 })

    mockAgent
      .get('https://localhost')
      .intercept({ path: '/api/some-path////' }).reply(200, { ok: true })

    const res = await fetch(new URL('/api/some-path//', 'https://localhost'))

    t.deepStrictEqual(await res.json(), { ok: true })
  })

  test('MockAgent should match with or without trailing slash /6', async (t) => {
    t = tspl(t, { plan: 1 })

    mockAgent
      .get('https://localhost')
      .intercept({ path: '/' }).reply(200, { ok: true })

    const res = await fetch(new URL('', 'https://localhost'))

    t.deepStrictEqual(await res.json(), { ok: true })
  })

  test('MockAgent should match with or without trailing slash /7', async (t) => {
    t = tspl(t, { plan: 1 })

    mockAgent
      .get('https://localhost')
      .intercept({ path: '' }).reply(200, { ok: true })

    const res = await fetch(new URL('/', 'https://localhost'))

    t.deepStrictEqual(await res.json(), { ok: true })
  })
})
