# ETIMEDOUT - network family autoselection timeout errors

If you are experiencing `TypeError: fetch failed` and you are able to investigate the `cause: AggregateError` and see `code: 'ETIMEDOUT'` it can be very likely due to timeout network family autoaselection. This tends to happen with DNS resolving domain to multiple ipv4 and ipv6 addresses.

The default timeout depends on local Node version, on Node 18.13.0 and above is 250 milliseconds.

### Increasing timeout by updating Node options directly

`export NODE_OPTIONS="--network-family-autoselection-attempt-timeout=500"`

### Increasing timeout by updating Node options in package.json

On example of a NextJS project:

```
{
  "private": true,
  "scripts": {
    "dev": "NODE_OPTIONS='--network-family-autoselection-attempt-timeout=500' next dev",
    "build": "next build",
    "start": "next start",
    "debug": "NODE_OPTIONS='--inspect-brk' next dev"
  },
  "dependencies": {
    ...
  }
}
```

### Increasing timeout by updating Undici Client with ClientOptions

You can also specify `autoSelectFamilyAttemptTimeout` option with a new Undici client. [Read more in the docs](https://github.com/nodejs/undici/blob/main/docs/docs/api/Client.md#parameter-connectoptions)
