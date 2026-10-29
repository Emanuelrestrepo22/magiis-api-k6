# magiis-api-k6

> API **end-to-end + performance** testing for a ride-hailing backend — Playwright + TypeScript for functional API E2E, **k6** for load/stress/latency, wired to an OpenAPI/Postman contract pipeline.

![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![k6](https://img.shields.io/badge/k6-7D64FF?logo=k6&logoColor=white)
![OpenAPI](https://img.shields.io/badge/OpenAPI-6BA539?logo=openapiinitiative&logoColor=white)

## What this project demonstrates
- **Contract-first API testing** — specs generated from a Postman collection -> OpenAPI -> typed responses via `openapi-typescript`.
- **Functional API E2E** with Playwright's request fixture: per-endpoint controllers + multi-step business flows.
- **Performance testing with k6** — smoke, load, stress, read-sweep and latency profiles.
- **Schema fuzz/property testing** via Schemathesis against the generated OpenAPI schema.
- **Multi-environment** config (test / uat / prod).

## Tech stack
Playwright · TypeScript · k6 · OpenAPI · Postman · Schemathesis · pnpm · Node >= 22

## Getting started
```bash
pnpm install
pnpm exec playwright install
cp .env.example .env

# Functional API E2E
pnpm test
pnpm run test:controllers
pnpm run test:flows

# Performance (k6)
pnpm run k6:smoke
pnpm run k6:load
pnpm run k6:stress
pnpm run k6:latency

# Contract pipeline
pnpm run generate:openapi
pnpm run generate:types
```

## Scope
API-only. The UI suites live in separate repos (carrier frontend + gateway E2E).
