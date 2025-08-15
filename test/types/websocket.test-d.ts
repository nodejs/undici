import { ReadableStream, WritableStream } from 'stream/web'
import { expectType } from 'tsd'
import { WebSocketStream, ErrorEvent } from '../../types'

declare const webSocketStream: WebSocketStream
const webSocketStreamOpened = await webSocketStream.opened

declare const errorEvent: ErrorEvent

// Test that the readable and writable streams are of identical types to ones from stream/web
expectType<WritableStream>(webSocketStreamOpened.writable)
expectType<ReadableStream>(webSocketStreamOpened.readable)

expectType<Error>(errorEvent.error)
