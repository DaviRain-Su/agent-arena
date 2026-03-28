FROM node:20-alpine

WORKDIR /app

# Copy sandbox package first (local dependency)
COPY sandbox/ ./sandbox/

# Copy judge service package files
COPY services/judge/package*.json ./

# Rewrite local dep path for Docker context
RUN sed -i 's|file:../../sandbox|file:./sandbox|g' package.json

# Install dependencies
RUN npm install --omit=dev

# Copy built judge service
COPY services/judge/dist/ ./dist/

# Copy ABI
COPY services/judge/src/abi.ts ./src/abi.ts

# State directory
RUN mkdir -p /root/.arena

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

CMD ["node", "dist/index.js"]
