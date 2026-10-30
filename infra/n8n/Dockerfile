FROM n8nio/n8n:latest

USER root

# Install postgresql-client for health checks
RUN apk add --no-cache postgresql-client

# Copy custom entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER node

ENTRYPOINT ["/entrypoint.sh"]
SHELL ["/bin/bash", "-c"]