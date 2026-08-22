/// <reference types="node" />

import type { Headers } from './fetch'

export interface Cookie {
  name: string
  value: string
  expires?: Date | number | undefined
  maxAge?: number | undefined
  domain?: string | undefined
  path?: string | undefined
  secure?: boolean | undefined
  httpOnly?: boolean | undefined
  sameSite?: 'Strict' | 'Lax' | 'None' | undefined
  unparsed?: string[] | undefined
}

export function deleteCookie (
  headers: Headers,
  name: string,
  attributes?: { path?: string | undefined, domain?: string | undefined }
): void

export function getCookies (headers: Headers): Record<string, string>

export function getSetCookies (headers: Headers): Cookie[]

export function setCookie (headers: Headers, cookie: Cookie): void

export function parseCookie (cookie: string): Cookie | null
