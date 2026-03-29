FROM node:20-alpine

RUN apk add --no-cache python3 make g++ git bash

WORKDIR /app

# Install pi agent globally (judge evaluator: pi --model k2p5)
RUN npm install -g @mariozechner/pi-coding-agent

# Build sandbox from source
COPY sandbox/package*.json ./sandbox/
COPY sandbox/src/ ./sandbox/src/
COPY sandbox/tsconfig.json ./sandbox/
RUN cd sandbox && npm install && npm run build

# Install judge deps — only copy package.json (NOT lock file) to avoid file: dep bug
COPY services/judge/package.json ./
RUN node -e "const p=require('./package.json'); delete p.dependencies['@agent-arena/sandbox']; require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))" \
    && npm install --omit=dev

# Link sandbox into node_modules (preserve dist/ structure)
RUN mkdir -p node_modules/@agent-arena/sandbox/dist && \
    cp -r sandbox/dist/* node_modules/@agent-arena/sandbox/dist/ && \
    cp sandbox/package.json node_modules/@agent-arena/sandbox/

# Copy built judge dist
COPY services/judge/dist/ ./dist/

RUN mkdir -p /root/.arena

RUN pi --version || echo "Warning: pi not found"

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

CMD ["node", "dist/index.js"]
