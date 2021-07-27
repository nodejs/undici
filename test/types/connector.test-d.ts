import { expectAssignable } from 'tsd'
import { Client, Connector } from '../..'

const connector = new Connector({ rejectUnauthorized: false })
expectAssignable<Connector>(connector)
expectAssignable<Client>(new Client('', {
  connect (opts: Connector.ConnectOptions, cb: Connector.connectCallback) {
    return connector.connect(opts, cb)
  }
}))
