import { ReadableStream, WritableStream } from 'stream/web'
import { expectType } from 'tsd'
import { WebSocketStream } from '../../types'

declare const webSocketStream: WebSocketStream
const webSocketStreamOpened = await webSocketStream.opened

// Test that the readable and writable streams are of identical types to ones from stream/web
expectType<WritableStream>(webSocketStreamOpened.writable)
expectType<ReadableStream>(webSocketStreamOpened.readable)
