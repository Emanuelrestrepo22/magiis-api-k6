# Playwright API Testing Framework

> **Framework reutilizable** de testing de APIs — Playwright + TypeScript para E2E funcional de API,
> **k6** para performance (smoke/load/stress/latency). Esqueleto de portfolio: estructura, cliente HTTP
> dirigido por entorno, asserts contractuales y scaffold de performance, sin acoplar a ninguna API concreta.

![Playwright](https://img.shields.io/badge/Playwright-2EAD33?logo=playwright&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![k6](https://img.shields.io/badge/k6-7D64FF?logo=k6&logoColor=white)

## Qué demuestra

- **Cliente API dirigido por entorno** (`tests/clients/`): login JWT con cache, Bearer automático,
  construcción de URL desde `BASE_URL` + prefijo, query params, timeouts — todo vía env (`.env.example`).
- **Config multi-entorno** (`tests/config/runtime.ts`): resuelve host/credenciales/rol por `ENV`.
- **Asserts contractuales reutilizables** (`tests/helpers/`): shape `Page<T>`, `List<T>`, objetos,
  rangos de status, lectura tolerante de JSON.
- **Fixtures de Playwright** (`tests/fixtures/`) para inyectar el cliente autenticado.
- **Performance con k6** (`k6/`): escenarios smoke/load/stress/latency con auth reutilizando la misma
  convención de env; thresholds `p95`/`http_req_failed`.
- **Calidad**: ESLint + Prettier + TypeScript estricto + commitlint (Conventional Commits) + husky
  (pre-commit/commit-msg) + CI de ejemplo (GitHub Actions).

## Stack

Playwright · TypeScript · k6 · pnpm · Node ≥ 22 · ESLint/Prettier · commitlint/husky

## Uso

```bash
pnpm install
pnpm exec playwright install
cp .env.example .env   # completar BASE_URL / credenciales del entorno a probar

# API funcional (agregá tus specs en tests/specs/)
pnpm test
pnpm run test:uat

# Performance (k6) — requiere el binario k6 en el PATH
pnpm run k6:smoke
pnpm run k6:latency

# Calidad
pnpm run lint && pnpm run typecheck && pnpm run format:check
```

## Estructura

```
tests/
  clients/    # cliente API genérico (login + verbos + URL builder)
  config/     # runtime config por entorno
  fixtures/   # fixtures Playwright (cliente autenticado)
  helpers/    # asserts contractuales reutilizables
  specs/      # (agregá acá tus specs de API)
k6/           # escenarios de performance (smoke/load/stress/latency)
```

## Notas

Esqueleto sin specs de negocio ni contratos de ninguna API real — pensado como base reutilizable y
muestra de estructura/tooling. Config y credenciales siempre vía `.env` (nunca commiteadas; ver `.env.example`).
