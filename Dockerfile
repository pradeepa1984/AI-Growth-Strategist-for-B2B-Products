# ── Stage 1: Build frontend ────────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /build/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN rm -rf node_modules dist
RUN npm install

# Copy source (includes .env.production) and build
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Backend runtime ───────────────────────────────────────────────────
FROM python:3.11-slim

# Keeps Python from buffering stdout/stderr so logs appear in CloudWatch immediately
ENV PYTHONUNBUFFERED=1

# Frontend origins allowed by CORS — overridable via ECS Task Definition env vars
ENV FRONTEND_URL=https://ai-growth-alb-779604145.us-east-1.elb.amazonaws.com

WORKDIR /app

# Install Python dependencies (cached layer — only re-runs when requirements.txt changes)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY backend/ .

# Copy KS enriched leads CSV (apollo leads.csv is already inside backend/data/)
COPY linkedin_pipeline/enriched_leads.csv ./data/enriched_leads.csv

# Copy all LinkedIn_Connections CSVs into /app/data/
COPY LinkedIn_Connections/*.csv ./data/

# Copy the built frontend assets from Stage 1 into /app/dist
COPY --from=frontend-build /build/frontend/dist ./dist

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--log-level", "info", "--access-log"]
