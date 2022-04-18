import { expectAssignable } from 'tsd'
import { Client, buildConnector } from '../..'
import { TLSSocket } from 'tls'

const connector = buildConnector({ rejectUnauthorized: false })
expectAssignable<Client>(new Client('', {
  connect (opts: buildConnector.Options, cb: buildConnector.Callback) {
    connector(opts, (...args) => {
      if (args[0]) {
        return cb(args[0], null)
      }
      if (args[1] instanceof TLSSocket) {
        if (args[1].getPeerCertificate().fingerprint256 !== 'FO:OB:AR') {
          args[1].destroy()
          return cb(new Error('Fingerprint does not match'), null)
        }
      }
      return cb(null, args[1])
    })
  }
}))
