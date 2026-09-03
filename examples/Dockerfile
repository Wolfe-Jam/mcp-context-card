# syntax=docker/dockerfile:1
#
# mcp-trinity over stateless Streamable HTTP.
#   docker build -f examples/Dockerfile -t mcp-trinity .
#   docker run -p 3000:3000 mcp-trinity
#   curl localhost:3000/.well-known/mcp/server-card
#
# Serves the bundled reference project.faf / project.fafm / .well-known/fafa.
# For a real project, mount it and set MCP_TRINITY_ROOT:
#   docker run -p 3000:3000 -v "$PWD:/project:ro" -e MCP_TRINITY_ROOT=/project mcp-trinity

FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY project.faf project.fafm ./
COPY .well-known ./.well-known
EXPOSE 3000
# --http is implied by PORT, but explicit is clearer in a CMD
CMD ["node", "dist/bin.js", "--http"]
