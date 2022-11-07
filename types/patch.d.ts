/// <reference types="node" />

// See https://github.com/nodejs/undici/issues/1740

export type DOMException = typeof globalThis extends { DOMException: infer T }
 ? T
 : any

export type EventTarget = typeof globalThis extends { EventTarget: infer T }
  ? T
  : any

export type Event = typeof globalThis extends { Event: infer T }
  ? T
  : any

export interface EventInit {
  bubbles?: boolean
  cancelable?: boolean
  composed?: boolean
}
