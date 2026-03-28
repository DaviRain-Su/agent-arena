# Agent Arena Judge Service - Docker Image
FROM node:20-alpine

# Install system dependencies for vm2 sandbox
RUN apk add --no-cache python3 make g++

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist/ ./dist/

# Create state directory
RUN mkdir -p /root/.arena

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# Start the service
CMD ["node", "dist/index.js"]
