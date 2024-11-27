#!/bin/bash

echo "* Starting squid"
squid -f /etc/squid/squid.conf -N &

echo "* Starting nginx"
/usr/sbin/nginx -g "daemon off;" &

echo "* starting TrafficServer"
/usr/bin/traffic_manager &

echo "* Starting Apache"
source /etc/apache2/envvars
/usr/sbin/apache2 -X &

echo "* Starting Varnish"
/usr/sbin/varnishd -j unix -a 0.0.0.0:8005 -f /etc/varnish/default.vcl -p default_ttl=0 -p default_grace=0 -p default_keep=3600 -s malloc,64M

echo "* Starting Caddy"
HOME=/root /caddy run --config /etc/caddy/Caddyfile
