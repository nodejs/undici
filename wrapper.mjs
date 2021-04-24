import undici from './index.js'

export const Client = undici.Client
export const Agent = undici.Agent

export const errors = undici.errors

export const Pool = undici.Pool

export const request = undici.request
export const stream = undici.stream
export const pipeline = undici.pipeline
export const setGlobalAgent = undici.setGlobalAgent
