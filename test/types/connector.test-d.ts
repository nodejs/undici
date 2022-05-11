import {expectAssignable} from 'tsd'
import { Client, buildConnector } from '../..'
import {ConnectionOptions, TLSSocket} from 'tls'
import {NetConnectOpts} from "net";

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

expectAssignable<buildConnector.BuildOptions>({
  checkServerIdentity: () => undefined,
  port: 80,
});
// This needs to be partial as required arguments (port) have a default in lib/core/connect.js
expectAssignable<ConnectionOptions>({} as buildConnector.BuildOptions);
expectAssignable<Partial<NetConnectOpts>>({} as buildConnector.BuildOptions);
