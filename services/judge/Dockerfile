FROM node:20-alpine

RUN apk add --no-cache python3 make g++ git bash

WORKDIR /app

# Install pi agent globally (judge evaluator: pi --model k2p5)
RUN npm install -g @mariozechner/pi-coding-agent

# Copy sandbox package (local dependency)
COPY sandbox/ ./sandbox/

# Copy judge service package files
COPY services/judge/package*.json ./

# Rewrite local dep path for Docker context
RUN sed -i 's|file:../../sandbox|file:./sandbox|g' package.json

# Install dependencies
RUN npm install --omit=dev

# Copy built judge service
COPY services/judge/dist/ ./dist/

# State directory
RUN mkdir -p /root/.arena

# Verify pi is available
RUN pi --version || echo "Warning: pi CLI not found"

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

CMD ["node", "dist/index.js"]
