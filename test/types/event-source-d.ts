import { URL } from 'url'
import { expectType } from 'tsd'

import {
	EventSource,
} from '../../'

declare const eventSource: EventSource

expectType<() => void>(eventSource.close)
expectType<string>(eventSource.url)
expectType<boolean>(eventSource.withCredentials)
expectType<0 | 1 | 2>(eventSource.readyState)

expectType<EventSource>(new EventSource('https://example.com'))
expectType<EventSource>(new EventSource(new URL('https://example.com')))
expectType<EventSource>(new EventSource('https://example.com', {}))
expectType<EventSource>(new EventSource('https://example.com', {
	withCredentials: true,
}))
