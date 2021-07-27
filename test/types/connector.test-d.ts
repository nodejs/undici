import { expectAssignable } from 'tsd'
import { Client, Connector } from '../..'
import { TLSSocket } from 'tls'

const connector = new Connector({ rejectUnauthorized: false })
expectAssignable<Connector>(connector)
expectAssignable<Client>(new Client('', {
  connect (opts: Connector.ConnectOptions, cb: Connector.connectCallback) {
    connector.connect(opts, (err, socket) => {
      if (err) {
        return cb(err, null)
      }
      if (socket instanceof TLSSocket) {
        if (socket.getPeerCertificate().fingerprint256 !== 'FO:OB:AR') {
          socket.destroy()
          return cb(new Error('Fingerprint does not match'), null)
        }
      }
      return cb(null, socket)
    })
  }
}))
