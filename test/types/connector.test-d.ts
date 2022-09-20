import {expectAssignable} from 'tsd'
import { Client, buildConnector } from '../..'
import {ConnectionOptions, TLSSocket} from 'tls'
import {IpcNetConnectOpts, NetConnectOpts, TcpNetConnectOpts} from "net";

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

expectAssignable<buildConnector.BuildOptions>({
  checkServerIdentity: () => undefined, // Test if ConnectionOptions is assignable
  localPort: 1234, // Test if TcpNetConnectOpts is assignable
});
