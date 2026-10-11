FROM node:22-slim
ENV NODE_ENV=production PORT=3000 SQLITE_FILE=/app/data/agenda-tti.db
WORKDIR /app
COPY package.json ./
# mysql2 é opcional: só é usado se você configurar DB_NAME
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY . .
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--no-warnings", "server.js"]
