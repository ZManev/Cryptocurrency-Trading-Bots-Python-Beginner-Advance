FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY e2e.ts ./

ENV NODE_ENV=production
ENV SOLANA_RPC_URL=https://api.devnet.solana.com

CMD ["npm", "run", "e2e"]
