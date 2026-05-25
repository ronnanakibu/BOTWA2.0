FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN addgroup -S botgroup && adduser -S botuser -G botgroup
USER botuser
CMD ["node", "src/core/bot.js"]