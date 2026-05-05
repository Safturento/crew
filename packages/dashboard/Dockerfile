FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/dashboard/package.json packages/dashboard/

RUN npm ci --workspaces --include-workspace-root

COPY packages/dashboard ./packages/dashboard

EXPOSE 5173

CMD ["npm", "run", "dev", "--workspace=crew-dashboard"]
