# EventSource

> ⚠️ Warning: the EventSource API is experimental.

Undici exposes a WHATWG spec-compliant implementation of [EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
for [Server-Sent Events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events).

## Instantiating EventSource

Undici exports a EventSource class. You can instantiate the EventSource as
follows:

```mjs
import { EventSource } from 'undici'

const eventSource = new EventSource('http://localhost:3000')
eventSource.onmessage = (event) => {
  console.log(event.data)
}
```

## Connection lifecycle (`text/event-stream`)

`EventSource` keeps a long-lived `text/event-stream` connection open and
automatically reconnects when appropriate.

Call `.close()` when you no longer need events to close the stream and release
its underlying connection resources:

```mjs
import { EventSource } from 'undici'

const es = new EventSource('http://localhost:3000/events')

es.onmessage = (event) => {
  console.log('event:', event.data)
}

es.onerror = (error) => {
  console.error('event stream error', error)
}

// Later, for example on shutdown:
es.close()
```

## Using a custom Dispatcher

undici allows you to set your own Dispatcher in the EventSource constructor.

An example which allows you to modify the request headers is:

```mjs
import { EventSource, Agent } from 'undici'

class CustomHeaderAgent extends Agent {
  dispatch (opts) {
    opts.headers['x-custom-header'] = 'hello world'
    return super.dispatch(...arguments)
  }
}

const eventSource = new EventSource('http://localhost:3000', {
  dispatcher: new CustomHeaderAgent()
})

```

More information about the EventSource API can be found on
[MDN](https://developer.mozilla.org/en-US/docs/Web/API/EventSource).
