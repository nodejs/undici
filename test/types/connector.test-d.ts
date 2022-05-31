import {expectAssignable} from 'tsd'
import { Client, buildConnector } from '../..'
import {ConnectionOptions, TLSSocket} from 'tls'
import {IpcNetConnectOpts, NetConnectOpts, TcpNetConnectOpts} from "net";

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
  checkServerIdentity: () => undefined, // Test if ConnectionOptions is assignable
  localPort: 1234, // Test if TcpNetConnectOpts is assignable
});
