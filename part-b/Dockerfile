FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY backend ./backend
COPY frontend ./frontend
RUN mkdir -p /app/data && chown -R node:node /app
USER node
ENV HOST=0.0.0.0 PORT=3000 DB_PATH=/app/data/slotbook.sqlite
EXPOSE 3000
CMD ["node", "backend/server.js"]
