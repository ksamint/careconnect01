# CareConnect: H5 front end + Node API with built-in SQLite, one container (linux/amd64).

# ---- build the H5 app ----
FROM --platform=linux/amd64 node:22-alpine AS web
WORKDIR /app/h5
COPY h5/package.json h5/package-lock.json ./
RUN npm install --no-audit --no-fund
COPY h5/ ./
RUN npm run build

# ---- runtime ----
FROM --platform=linux/amd64 node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    STATIC_DIR=/app/web \
    TZ=Asia/Shanghai
WORKDIR /app/server
COPY server/package.json server/*.mjs ./
COPY --from=web /app/h5/dist /app/web
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "index.mjs"]
