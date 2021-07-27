import { expectAssignable } from 'tsd'
import { Client, buildConnector } from '../..'
import { TLSSocket } from 'tls'

const connector = buildConnector({ rejectUnauthorized: false })
expectAssignable<Client>(new Client('', {
  connect (opts: buildConnector.Options, cb: buildConnector.Callback) {
    connector(opts, (err, socket) => {
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
