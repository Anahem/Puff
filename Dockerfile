FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY . .

RUN mkdir -p data

RUN addgroup -S puff && adduser -S puff -G puff \
    && chown -R puff:puff /app
USER puff

EXPOSE 3000
CMD ["node", "--experimental-sqlite", "server.js"]
