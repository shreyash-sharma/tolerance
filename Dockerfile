# One container: the Python backend serves the API and the exported web pages on one port (Cloud Run supplies PORT).
# Stage 1: build the web app as static files.
FROM node:22-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
ENV STATIC_EXPORT=1 NEXT_TELEMETRY_DISABLED=1
RUN npx next build

# Stage 2: the backend.
FROM python:3.11-slim
# PostgreSQL refuses to run as root, so the app runs as an unprivileged user
RUN useradd -m app && apt-get update && apt-get install -y --no-install-recommends libpq5 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
COPY --from=web /web/out /app/web/out
RUN mkdir -p /tmp/tol && chown -R app /app /tmp/tol
ENV PYTHONUNBUFFERED=1 TOLERANCE_DATA=/tmp/tol FALLBACK_GEMMA=0
USER app
# One instance only: the live feed, the connectors and the Guide keep state in memory.
CMD exec uvicorn server.app:app --host 0.0.0.0 --port ${PORT:-8080}
