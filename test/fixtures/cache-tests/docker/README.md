# Docker Image for Proxy Caches

This Docker image runs reverse proxy caches for testing.

To add a new reverse proxy:

1. In `Dockerfile`:
  1. add its ubuntu package to the `apt-get` line
  2. make any configuration adjustments with `COPY` and/or `RUN` in a new section. In particular:
     a. The proxy should listen on a dedicated port (the next in the 8000 series that's available)
     b. It should use localhost:8000 for the origin server
2. In `setup.sh`, run any additional configuration steps that are necessary
3. In `entrypoint.sh`, add the needed commands (usually `sed`) to change the origin server hostname (for when the docker runs on desktop)
4. In `serve.sh`, start the server in the background
5. In `/test-docker.sh`, add the `PROXY_PORT` to the case statement

