FROM node:22-slim

# curl for the compose healthcheck command
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests first so npm ci layer caches well
COPY package.json package-lock.json ./
COPY packages/daemon/package.json packages/daemon/
COPY packages/shared/package.json packages/shared/

# Install all workspace deps including devDeps (we need tsx for `npm run dev`)
RUN npm ci --workspaces --include-workspace-root

# Copy sources so the image is independently runnable. At runtime, compose
# bind-mounts these dirs from the host for hot-reload — anonymous volume
# on /app/node_modules preserves the install above.
COPY packages/shared ./packages/shared
COPY packages/daemon ./packages/daemon

# Bind the daemon to all container interfaces so the host port mapping reaches it.
ENV CREW_HOST=0.0.0.0

EXPOSE 7773

CMD ["npm", "run", "dev", "--workspace=crew-daemon"]
