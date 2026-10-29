# Arquitectura — magiis-api-e2e

Suite de tests API (Playwright + TypeScript) del backend Magiis (`magiis-be`, API v0.2).
**Ejecución LOCAL-ONLY** (los workflows de CI son escape hatches manuales; ver `BACKLOG.md`).

## Diagrama de capas

```
+------------------------------------------------------------------+
|  Ejecución LOCAL (npm scripts)                                   |
|    test | test:flows | test:controllers | test:test|uat|prod     |
|    test tests/specs/_mutation (ALLOW_MUTATIONS=1, opt-in)        |
|  CI opcional/manual: .github/workflows/{api-tests,k6-tests}.yml  |
+------------------------------------------------------------------+
|  playwright.config.ts  -->  .env.<env> (dotenv)                  |
|    testMatch **/*.api.test.ts · project "api" (APIRequestContext) |
+------------------------------------------------------------------+
|  tests/specs/                                                    |
|    _flows/        workflows encadenados (describe.serial)        |
|    controllers/   1 archivo por controller — cobertura READ-ONLY |
|    _mutation/     harness create→verify→cleanup (guarded)        |
+------------------------------------------------------------------+
|  tests/fixtures/apiFixture.ts → magiisApi (cliente) + cfg        |
|  tests/clients/magiis-api-client.ts → GET/POST/... + JWT cache   |
|  tests/config/runtime.ts → env, baseURL, prefijo, creds, IDs     |
|  tests/helpers/ → expect2xx, expectPageShape, expectArray, ...   |
|  tests/generated/ → tipos TS desde openapi.yaml (gitignored)     |
+------------------------------------------------------------------+
|  CONTRATO (ground truth)                                         |
|    magiis-be (source Java) --[extract-be-catalog]--> catalog+dtos |
|                            --[generate-openapi-from-source]--> openapi.yaml
|    openapi.yaml (802 ops / 601 schemas) → Swagger UI + MCP + schemathesis + k6
+------------------------------------------------------------------+
|  Subproyectos                                                    |
|    k6/          performance (deriva endpoints de openapi.yaml)   |
|    schemathesis/ contract fuzzing (pytest, desde openapi.yaml)   |
+------------------------------------------------------------------+
```

## Principios

1. **Ground truth = source del backend.** El contrato (rutas, DTOs, schemas) se deriva del código
   de `magiis-be`, no de un snapshot. `openapi.yaml` se genera desde el source (ver más abajo).
2. **Separación de capas**: specs declaran intención · helpers encapsulan asserts · cliente abstrae
   transport · runtime resuelve env. Un solo motivo de cambio por capa.
3. **Read-only vs mutación separados**: `controllers/` = solo GET (runnable siempre); `_mutation/` =
   POST/PUT/DELETE con patrón create→verify→cleanup, doble guard (`ALLOW_MUTATIONS` + anti-PROD).
4. **3 environments aislados** (`test`/`uat`/`prod`) con `.env.<env>` propios. PROD usa host
   `api.apps.example.com` **sin** prefijo de versión (test/uat usan `.../magiis-v0.2`).
5. **Sin secretos en git**: `.env.*` gitignored (excepto `.env.example`). `.mcp.json` gitignored.
6. **JWT cacheado** por sesión (`MagiisApiClient.ensureToken()`).
7. **Trazabilidad**: título `Validar GET ...`; IDs `TS-API-TC###` solo si existen en la matriz.

## Pipeline de contrato (source → spec)

```
magiis-be (repo local, BE_REPO)
  └─ scripts/extract-be-catalog.ts   (npm run catalog:from-be)
       → scripts/backend-route-catalog.json  (65 controllers, rutas por handler)
       → scripts/backend-dtos.json            (@RequestBody DTO por endpoint)
  └─ scripts/generate-openapi-from-source.ts  (npm run generate:openapi)
       parsea @*Mapping + @PathVariable/@RequestParam/@RequestBody + ResponseEntity<T>,
       resuelve DTO/entities Lombok → components.schemas (transitivo, corta ciclos),
       marca @Deprecated → deprecated:true
       → openapi.yaml  (737 paths / 802 ops / 601 schemas · 0 $ref rotos)
```

`openapi.yaml` alimenta: Swagger UI (`npm run serve:swagger`), MCP `openapi`
(`mcp-openapi-schema-explorer`), Schemathesis, k6 (`gen-k6-endpoints`) y los tipos TS
(`npm run generate:types` → `tests/generated/`).

**Legacy (snapshot Postman)**: `generate-openapi-from-source` reemplazó al pipeline basado en el
snapshot (`generate-openapi:snapshot` + `sanitize-postman-snapshot` + `fix-spec-routes` +
`generate-specs-from-postman`). Se conservan como referencia; el snapshot tenía rutas perdidas e
IDs literales. Ver `docs/reference/backend-endpoints-v1.72.2.md`.

## Scripts

| Script                             | npm                         | Rol                                                       |
| ---------------------------------- | --------------------------- | --------------------------------------------------------- |
| `extract-be-catalog.ts`            | `catalog:from-be`           | catálogo de rutas + DTOs desde el source (ground truth)   |
| `generate-openapi-from-source.ts`  | `generate:openapi`          | **openapi.yaml canónico** desde el source                 |
| `generate-openapi-from-postman.ts` | `generate:openapi:snapshot` | legacy (snapshot)                                         |
| `sanitize-postman-snapshot.ts`     | `sanitize:snapshot`         | legacy — sanea/repara el snapshot                         |
| `fix-spec-routes.ts`               | —                           | codemod que corrigió rutas rotas de los stubs (histórico) |
| `gen-k6-endpoints.mjs`             | `k6:gen-endpoints`          | deriva GET read-only de openapi.yaml para k6              |
| `verify-prod-bugs.ts`              | —                           | verificación read-only de bugs contra `.env.prod`         |
| `fetch-postman-collection.ts`      | `fetch:collection`          | descarga snapshot Postman (legacy)                        |
| `parse-pax-usage.mjs`              | —                           | análisis de uso de endpoints de la pax app                |

## MCP servers (`.mcp.json`)

`playwright` (debug UI) · `postman` (workspace QA) · `openapi` (explora `openapi.yaml`, read-only) ·
`engram` (memoria persistente local).

## Flujo de un run (read-only)

```
1. npm test (ENV=uat por default) → dotenv carga .env.uat  (o ENV=prod → .env.prod, read-only)
2. cada spec usa magiisApi (cliente); 1er request → ensureToken() → POST auth/login → JWT cache
3. asserts de status + shape (helpers) contra el contrato
4. reports/html + reports/junit.xml
```

## Crecer el suite

- **Controller read-only nuevo**: crear/editar `tests/specs/controllers/<kebab>.api.test.ts`, solo
  GET, rutas del catálogo, asserts de shape desde `openapi.yaml`. Ver ejemplos multi-region/billing.
- **Mutación**: agregar `tests/specs/_mutation/<kebab>.mutation.api.test.ts` (patrón del harness,
  `docs/reference/mutation-harness.md`) — guarded, requiere `ALLOW_MUTATIONS=1` + UAT + luz verde.
- **Flow encadenado**: `tests/specs/_flows/NN-<nombre>.api.test.ts` con `describe.serial`.

## Estado y roadmap

Cobertura, hallazgos (bugs verificados en PROD, uso FE↔BE, triage de fixmes) y próximos pasos en
`BACKLOG.md` y `docs/reference/`. Subproyectos k6 y schemathesis: scaffold hecho; primera corrida
real requiere luz verde del QA Lead + credenciales (regla `docs/SCOPE.md`).

## Convención de ramas y commits

- Ramas: `api/<scope>` (specs) · `infra/<change>` (config) · `chore/<task>` (mantenimiento).
- Commits (commitlint): `<tipo>(<scope>): [TS-API-TC###|MX-XXXX] descripción`.
