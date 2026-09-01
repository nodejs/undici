/// <reference types="node" />

// See https://github.com/nodejs/undici/issues/1740

export interface EventInit {
  bubbles?: boolean | undefined
  cancelable?: boolean | undefined
  composed?: boolean | undefined
}

export interface EventListenerOptions {
  capture?: boolean | undefined
}

export interface AddEventListenerOptions extends EventListenerOptions {
  once?: boolean | undefined
  passive?: boolean | undefined
  signal?: AbortSignal | undefined
}

export type EventListenerOrEventListenerObject = EventListener | EventListenerObject

export interface EventListenerObject {
  handleEvent (object: Event): void
}

export interface EventListener {
  (evt: Event): void
}
