FROM node:22-slim

# curl for the compose healthcheck command. PrPoller's PR-state checks now go
# through the daemon's in-process Octokit client (CREW-301), so the `gh` CLI is
# no longer installed.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests first so npm ci layer caches well.
# tsconfig.base.json travels with them because each package's tsconfig extends it.
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/daemon/package.json packages/daemon/
COPY packages/shared/package.json packages/shared/

# Install all workspace deps including devDeps (we need tsx for `npm run dev`)
RUN npm ci --workspaces --include-workspace-root

# Copy sources so the image is independently runnable. At runtime, compose
# bind-mounts these dirs from the host for hot-reload — anonymous volume
# on /app/node_modules preserves the install above.
COPY packages/shared ./packages/shared
COPY packages/daemon ./packages/daemon

EXPOSE 7773

# Container-bind concern (CREW_HOST=0.0.0.0) lives in docker-compose.yml so the
# image default stays loopback-safe for ad-hoc `docker run` use.
CMD ["npm", "run", "dev", "--workspace=crew-daemon"]
