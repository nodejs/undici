/// <reference types="node" />

import { EventTarget, Event } from './patch'

export type BinaryType = 'blob' | 'arraybuffer'

// TODO: add CloseEvent and MessageEvent
interface WebSocketEventMap {
  close: Event
  error: Event
  message: Event
  open: Event
}

interface WebSocket extends EventTarget {
  binaryType: BinaryType
  
  readonly bufferedAmount: number
  readonly extensions: string

  onclose: ((this: WebSocket, ev: WebSocketEventMap['close']) => any) | null
  onerror: ((this: WebSocket, ev: WebSocketEventMap['error']) => any) | null
  onmessage: ((this: WebSocket, ev: WebSocketEventMap['message']) => any) | null
  onopen: ((this: WebSocket, ev: WebSocketEventMap['open']) => any) | null

  readonly protocol: string
  readonly readyState: number
  readonly url: string

  close(code?: number, reason?: string): void
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void

  readonly CLOSED: number
  readonly CLOSING: number
  readonly CONNECTING: number
  readonly OPEN: number

  addEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void
  removeEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void
}

export declare const WebSocket: {
  prototype: WebSocket
  new (url: string | URL, protocols?: string | string[]): WebSocket
  readonly CLOSED: number
  readonly CLOSING: number
  readonly CONNECTING: number
  readonly OPEN: number
}
