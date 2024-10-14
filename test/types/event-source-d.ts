import { URL } from 'url'
import { expectType, expectAssignable } from 'tsd'

import { EventSource, EventSourceInit, Dispatcher } from '../../'

declare const eventSource: EventSource
declare const agent: Dispatcher

expectType<() => void>(eventSource.close)
expectType<string>(eventSource.url)
expectType<boolean>(eventSource.withCredentials)
expectType<0 | 1 | 2>(eventSource.readyState)

expectType<EventSource>(new EventSource('https://example.com'))
expectType<EventSource>(new EventSource(new URL('https://example.com')))
expectType<EventSource>(new EventSource('https://example.com', {}))
expectType<EventSource>(new EventSource('https://example.com', {
  withCredentials: true
}))

expectAssignable<EventSourceInit>({ dispatcher: agent })
expectAssignable<EventSourceInit>({ withCredentials: true })
expectAssignable<EventSourceInit>({})
