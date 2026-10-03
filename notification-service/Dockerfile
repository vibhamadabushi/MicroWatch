FROM node:18-alpine

WORKDIR /app

# Cache dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source code
COPY . .

EXPOSE 3003 8003 9467

CMD ["node", "index.js"]
