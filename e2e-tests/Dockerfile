# Playwright includes all browsers + system deps pinned to the Playwright version
FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /work

# ---- install e2e-tests deps first (better layer caching) ----
COPY e2e-tests/package.json e2e-tests/package-lock.json* ./e2e-tests/
WORKDIR /work/e2e-tests
RUN npm ci

# ---- copy the rest of the repo (so tests can import shared code, helpers, etc.) ----
WORKDIR /work
COPY . .

# Default workdir when container runs
WORKDIR /work/e2e-tests

# Keep it simple: compose will override the command per shard/project
CMD ["npm", "run", "test:ui:headless"]
