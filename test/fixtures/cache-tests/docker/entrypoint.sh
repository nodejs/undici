#!/bin/bash

# If an argument is passed, make it the hostname for the origin server in proxy configs, and start the servers.

if [[ ! -z $1 ]] ; then

    # squid
    sed -i s/localhost/$1/g /etc/squid/conf.d/cache-test.conf

    # nginx
    sed -i s/localhost/$1/g /etc/nginx/sites-enabled/cache-test.conf
    sed -i s/worker_connections 768/worker_connections 2048/ /etc/nginx/nginx.conf

    # trafficserver
    sed -i s/localhost:8000/$1:8000/g /etc/trafficserver/remap.config

    # apache
    sed -i s/localhost/$1/g /etc/apache2/sites-enabled/cache-test.conf

    # varnish
    sed -i s/127.0.0.1/$1/ /etc/varnish/default.vcl

    # caddy
    sed -i s/127.0.0.1/$1/ /etc/caddy/Caddyfile

    serve.sh
  fi


/bin/bash

