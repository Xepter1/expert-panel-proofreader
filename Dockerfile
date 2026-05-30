# --- Stage 1: Build the React Frontend ---
FROM node:18-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy frontend dependency manifests
COPY frontend/package*.json ./
RUN npm install

# Copy frontend source and build static distribution
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Create Production Server Container ---
FROM node:18-alpine AS runner
WORKDIR /app

# Set environment
ENV NODE_ENV=production
ENV PORT=5001

# Copy backend dependencies
COPY backend/package*.json ./backend/
RUN cd backend && npm install --only=production

# Copy backend code
COPY backend/ ./backend/

# Copy built frontend from Stage 1 into backend's reach
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose port
EXPOSE 5001

# Run Server
CMD ["node", "backend/server.js"]
