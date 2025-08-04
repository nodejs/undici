FROM alpine:latest

# Install Dante SOCKS server
RUN apk add --no-cache dante-server

# Create dante user
RUN adduser -D -s /bin/false dante

# Copy configuration
COPY danted.conf /etc/danted.conf

# Create log directory
RUN mkdir -p /var/log/dante && chown dante:dante /var/log/dante

# Expose SOCKS port
EXPOSE 1080

# Run Dante
CMD ["danted", "-f", "/etc/danted.conf"]