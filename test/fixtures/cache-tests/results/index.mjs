
export default [
  {
    file: 'chrome.json',
    name: 'Chrome',
    type: 'browser',
    version: '126.0.6478.127'
  },
  {
    file: 'firefox.json',
    name: 'Firefox',
    type: 'browser',
    version: '127.0.2',
    link: 'https://github.com/http-tests/cache-tests/wiki/Firefox'
  },
  {
    file: 'safari.json',
    name: 'Safari',
    type: 'browser',
    version: 'Version 17.5 (19618.2.12.11.6)'
  },
  {
    file: 'nginx.json',
    name: 'nginx',
    type: 'rev-proxy',
    version: '1.26.0-1ubuntu2',
    link: 'https://github.com/http-tests/cache-tests/wiki/nginx'
  },
  {
    file: 'squid.json',
    name: 'Squid',
    type: 'rev-proxy',
    version: '6.9-1ubuntu1',
    link: 'https://github.com/http-tests/cache-tests/wiki/Squid'
  },
  {
    file: 'trafficserver.json',
    name: 'ATS',
    type: 'rev-proxy',
    version: '9.2.4+ds-2',
    link: 'https://github.com/http-tests/cache-tests/wiki/Traffic-Server'
  },
  {
    file: 'apache.json',
    name: 'httpd',
    type: 'rev-proxy',
    version: '2.4.59-2ubuntu2',
    link: 'https://github.com/http-tests/cache-tests/wiki/Apache-httpd'
  },
  {
    file: 'varnish.json',
    name: 'Varnish',
    type: 'rev-proxy',
    version: '7.1.1-1.1ubuntu1',
    link: 'https://github.com/http-tests/cache-tests/wiki/Varnish'
  },
  {
    file: 'caddy.json',
    name: 'caddy',
    type: 'rev-proxy',
    version: '0.7.0',
    link: 'https://github.com/http-tests/cache-tests/wiki/Caddy'
  },
  {
    file: 'fastly.json',
    name: 'Fastly',
    type: 'cdn',
    version: '2024-07-09',
    link: 'https://github.com/http-tests/cache-tests/wiki/Fastly'
  }
]
