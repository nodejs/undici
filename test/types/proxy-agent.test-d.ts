import { expectAssignable } from 'tsd'
import { URL } from 'url'
import { ProxyAgent, setGlobalDispatcher, getGlobalDispatcher, Agent } from '../..'

expectAssignable<ProxyAgent>(new ProxyAgent(''))
expectAssignable<ProxyAgent>(new ProxyAgent({ uri: '' }))
expectAssignable<ProxyAgent>(
  new ProxyAgent({
    connections: 1,
    uri: '',
    auth: '',
    token: '',
    maxRedirections: 1,
    factory: (_origin: URL, opts: Object) => new Agent(opts),
    requestTls: {
      ca: [''],
      key: '',
      cert: '',
      servername: '',
      timeout: 1
    },
    proxyTls: {
      ca: [''],
      key: '',
      cert: '',
      servername: '',
      timeout: 1
    }
  })
)

{
  const proxyAgent = new ProxyAgent('')
  expectAssignable<void>(setGlobalDispatcher(proxyAgent))
  expectAssignable<ProxyAgent>(getGlobalDispatcher())

  // close
  expectAssignable<Promise<void>>(proxyAgent.close())

  // dispatch
  expectAssignable<boolean>(proxyAgent.dispatch({ origin: '', path: '', method: 'GET' }, {}))
}
