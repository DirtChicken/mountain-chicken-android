FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm install && npm run build && npm prune --omit=dev
ENV PORT=8787
ENV DATA_DIR=/data
EXPOSE 8787
CMD ["node", "dist/index.js"]
