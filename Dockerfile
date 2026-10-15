FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @smorg/shell build

FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV PORT=8080
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages ./packages
COPY apps ./apps
COPY --from=build /app/packages/shell/dist ./packages/shell/dist
# tsx is a runtime dependency (TypeScript sources); keep prod install lean.
RUN pnpm install --prod --frozen-lockfile
EXPOSE 8080
CMD ["pnpm", "--filter", "@smorg/server", "start"]
