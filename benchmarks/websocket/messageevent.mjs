import { bench, group, run } from 'mitata'
import { createFastMessageEvent, MessageEvent as UndiciMessageEvent } from '../../lib/web/websocket/events.js'

const { port1, port2 } = new MessageChannel()

group('MessageEvent instantiation', () => {
  bench('undici - fast MessageEvent init', () => {
    return createFastMessageEvent('event', { data: null, ports: [port1, port2] })
  })

  bench('undici - MessageEvent init', () => {
    return new UndiciMessageEvent('event', { data: null, ports: [port1, port2] })
  })

  bench('global - MessageEvent init', () => {
    return new MessageEvent('event', { data: null, ports: [port1, port2] })
  })
})

await run()
