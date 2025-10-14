# ai-agent/Dockerfile
FROM node:20-alpine

WORKDIR /app
COPY package.json ./
RUN npm install --production

COPY server.js ./
COPY public ./public

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
