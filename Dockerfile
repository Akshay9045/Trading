# Backend for Railway: the /api server only (the website is on Netlify).
# server/ uses Node built-ins only, so there is nothing to npm install.
FROM node:22-alpine
WORKDIR /app

COPY package.json ./
COPY server ./server

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

# Runs as root so it can write to Railway's volume, which is mounted root-owned at /data
RUN mkdir -p /data
EXPOSE 8080
CMD ["node", "server/index.js"]
