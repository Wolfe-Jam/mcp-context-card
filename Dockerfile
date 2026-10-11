# Builds and runs mcp-context-card as a stdio MCP server, the same way CI
# builds it: npm ci against the lockfile, then tsc. CI builds this image and
# checks the server answers (see the docker job in .github/workflows/ci.yml).
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=node:node /app /app
USER node
# stdio by default; set PORT (or pass --http) for Streamable HTTP.
CMD ["node", "dist/bin.js"]
