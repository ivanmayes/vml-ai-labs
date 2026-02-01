#!/usr/bin/env bash
set -e

echo "=== Generating API Manifest from Swagger ==="

cd apps/api

# Generate OpenAPI spec using NestJS Swagger CLI plugin
npx ts-node -r tsconfig-paths/register scripts/generate-openapi.ts

echo "[OK] API manifest generated at api-manifest.json"
