FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile || pnpm install
RUN pnpm --filter @smorg/shell build

FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages ./packages
COPY apps ./apps
COPY --from=build /app/packages/shell/dist ./packages/shell/dist
RUN pnpm install --prod --frozen-lockfile || pnpm install --prod
EXPOSE 3000
CMD ["pnpm", "--filter", "@smorg/server", "start"]
