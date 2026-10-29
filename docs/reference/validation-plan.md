# Plan de validación por ejecución — magiis-api-e2e

Fecha: 2026-07-14. Objetivo: validar por **ejecución real** cada artefacto que hoy está escrito y
validado solo estáticamente (tsc/eslint/prettier/collection), pero nunca corrido contra un backend.

## Ambientes del proyecto (leer primero)

**Regla (2026-07-15):** los ambientes de trabajo son **UAT y PROD**. TEST queda **fuera** del proyecto.

- **UAT (`.env.uat`) — ambiente seguro de ejecución.** Acá corre TODO: suite completa, harness de
  mutación, k6 smoke/load/stress, schemathesis. La ejecución real está **desbloqueada** (antes lo
  bloqueaba la ausencia de env TEST). Mutar/cargar requiere luz verde del QA Lead.
- **PROD (`.env.prod`) — solo lecturas de bajo volumen.** NADA de carga (k6 load/stress), fuzzing
  (schemathesis) ni mutación (el harness se auto-bloquea en prod).
- Nota: donde la matriz de abajo dice "❌ falta `.env.test`", léase ahora **✅ ejecutable en UAT**
  (con `.env.uat` + luz verde). Los ítems marcados "PROD read-only" siguen igual.

## Matriz de validación por artefacto

| #   | Artefacto                                    | Cómo validar (ejecutar)                                     | Entorno seguro                    | ¿Ejecutable hoy?                                                                                    |
| --- | -------------------------------------------- | ----------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------- |
| 1   | Suite read-only (controllers GET, ~28 ctrls) | `npm run test:test` (o subset)                              | TEST                              | ❌ falta `.env.test`. En PROD: solo un **subset smoke** read-only (flows + 1-2 ctrls), bajo volumen |
| 2   | Flows (`_flows/`, 4)                         | `npm run test:flows`                                        | TEST                              | ❌ falta `.env.test`; smoke read-only en PROD posible                                               |
| 3   | Bugs (travels/paginated, admins/paginated)   | `npx tsx scripts/verify-prod-bugs.ts`                       | PROD (read-only)                  | ✅ **YA VALIDADO** (bug1 500, bug2 200 access-control)                                              |
| 4   | Harness de mutación (7 ctrls, `_mutation/`)  | `ALLOW_MUTATIONS=1 npm run test:test tests/specs/_mutation` | TEST                              | ❌ requiere TEST + luz verde (anti-prod guard lo bloquea en prod, correcto)                         |
| 5   | k6 smoke (1 VU)                              | instalar k6 → `k6 run k6/smoke.js`                          | TEST (o PROD smoke con luz verde) | ❌ k6 no instalado + falta env                                                                      |
| 6   | k6 load/stress/sweep                         | `k6 run k6/{load,stress,read-sweep}.js`                     | TEST/UAT (NUNCA PROD)             | ❌ solo TEST/UAT + luz verde                                                                        |
| 7   | Schemathesis (contract fuzz)                 | `ALLOW... pytest schemathesis` con creds                    | TEST (NUNCA PROD)                 | ❌ requiere TEST (fuzzing en prod prohibido)                                                        |
| 8   | openapi.yaml (contrato)                      | ya validado: 0 $ref rotos, schemathesis colecta 802         | —                                 | ✅ validado estáticamente                                                                           |

## Secuencia de ejecución (en UAT, `.env.uat`)

1. **Read-only smoke**: `npm run test:flows` → los 4 flows verdes (auth + lecturas core).
2. **Read-only completo**: `npm run test:controllers` → los ~28 ctrls con asserts; triar fallos
   (bug backend real vs dato de test vs 403 por rol). Los tolerantes `[200,4xx]` que den **500**
   son bugs (como travels/paginated).
3. **k6**: instalar binario → `smoke` en TEST → si OK, `load` en TEST/UAT (nunca prod).
4. **Schemathesis**: `pytest` con creds TEST sobre un subset de endpoints críticos → triar hallazgos.
5. **Harness de mutación**: `ALLOW_MUTATIONS=1` en TEST, un controller a la vez, verificar cleanup.

## Qué se puede validar HOY (solo PROD, read-only, bajo volumen)

- ✅ Bugs (#3) — ya hecho.
- 🟡 **Smoke read-only en PROD** (con luz verde): correr los 4 flows + 1-2 controllers de lectura
  contra prod para validar el mecanismo end-to-end (login + asserts) sin carga. NO la suite completa
  (460 tests = demasiada lectura sobre prod).

## Resultado smoke PROD (2026-07-14, con luz verde)

Ejecutado read-only, bajo volumen (21 tests, ~13s): `ENV=prod playwright test tests/specs/_flows
tests/specs/controllers/{config,multi-region}.api.test.ts`.

- **19 passed · 2 skipped** (los 2 skipped = fixme de `travels/paginated` + dependiente, bug conocido).
- Validado: mecanismo end-to-end contra PROD (login JWT + host `api.apps.example.com` + prefijo vacío
  → fix de `runtime.ts` correcto); cobertura read-only de multi-region (11/11) con datos reales;
  flows core (auth, carrier, driver, cardTypes) verdes; config serverInfo público verde.
- Conclusión: la suite read-only está **validada por ejecución** en su mecanismo y en la muestra
  corrida. La suite completa (~28 ctrls) queda pendiente de correr contra TEST (o prod con más luz
  verde), esperando además que termine el workflow de cobertura en curso.

## Resultado k6 latencia PROD (2026-07-14, read-only, carga baja)

Instalado k6 v2.1.0 (`~/bin/k6.exe`). Escenario `k6/latency.js` (`npm run k6:latency`) — 4 GET rápidos
read-only (serverInfo, carriers/{id}, multiregion/countries+timezones), login en setup.

- Baseline 1 VU: p95 328ms, 0% fallos.
- **Concurrencia 5 VUs / 20s: 481 req, 0% fallos, p95 256ms · p99 360ms** (thresholds p95<800/p99<1500 ✓).
- Sin degradación bajo concurrencia liviana. k6 validado end-to-end (config prod + auth + escenario).
- NO ejecutado: `load`/`stress`/`read-sweep` contra prod (cargarían producción) — reservados para TEST/UAT.

## Resultado suite read-only COMPLETA PROD (2026-07-15) — VALIDADO POR EJECUCIÓN

Se corrió la suite read-only completa (`controllers/` + `_flows/`) contra PROD (carrier 1040) e iteró
hasta verde. Progresión: **#1 133/51/123 → #2 191/29/75 → #3 204/2/89 → #4 0 fallos**.

- **Método**: cada fallo triado por **ground-truth contra prod** (`scripts/probe-prod-failures.ts`,
  read-only, login único, status + cuerpo de error con params exactos + variantes). Sin adivinar.
- **Hallazgo**: la mayoría de los 500 eran **anti-patrón backend** (`Optional.get()` unguarded sobre
  filtros de paginación + `JpaSort.unsafe` inyectando `column`), no test. Backend **1-indexed**.
- **Fixes de test**: enviar los params del FE real (`find:''`); `test.fixme`+causa en bugs backend
  genuinos y externos (skip-conocido, sin enmascarar); enum válido; `readJsonSafe`/`expectNestedPageShape`.
- **Resultado**: suite **verde**; los únicos no-verdes son `test.fixme` trazados a hallazgos BE-1..BE-10
  del BACKLOG (bugs backend / integraciones externas sin config). Artefacto #1 (suite read-only):
  **✅ VALIDADO POR EJECUCIÓN en PROD**.
- **Nota de política**: la corrida final #4 fue **subset** (18 specs afectados) para respetar bajo
  volumen en prod; las 3 completas previas cubrieron el universo.

## Ejecución real en UAT (2026-07-15) — artefactos #1, #4, #5 VALIDADOS

Primera corrida real contra **UAT** (`.env.uat`, carrier 1040) tras la política UAT+PROD.

- **Auth/conectividad UAT**: ✅ login JWT válido; flows core verdes.
- **#1 Suite read-only** (`ENV=uat`, controllers + flows): **205 passed / 1 failed / 98 skipped**. Único
  fallo = `vendor/mailchimp/{userId}/batches/{batchId}` → 500 (Mailchimp externo con batchId placeholder;
  robustez, mismo BE-10) → `test.fixme`. Paridad con PROD.
- **#5 k6 smoke** (1 VU): **latencia p95 472ms** (< 800 ✓). `travels/paginated?column=id` → **500: Bug 1
  REPRODUCE en UAT** → confirma que es bug de código backend, no data de un ambiente (breach de
  `http_req_failed` = ese bug conocido).
- **#4 Harness de mutación** (`ALLOW_MUTATIONS=1 ENV=uat`, serializado) — **ejecución real + hardening**:
  - **1ª corrida**: 2 verdes / 6 fallos en create-verify / 4 skip. Residuo 0.
  - **Hardening por ingeniería inversa del source BE** (workflow, 6 agentes, cada constraint con archivo:línea):
    se dedujeron los contratos reales y se corrigieron los 6 payloads → **2ª corrida: 8/8 controllers
    no-seed en VERDE** (create→verify→cleanup): carrier-{zone,area,service-types,user,other-cost,concept-tax},
    special-rate-trigger, magiis-access.
  - **4 skipped** por falta de seed vars: `client`, `contractor-area`, `contractor-employee`, `contractor-user`.
  - **Residuo: 0** — verificado post-corrida en `otherCosts` (search QA-HARNESS → 0) y `carrierUser`
    (paginated → 0 QA-HARNESS). El cleanup en `finally` de cada spec funcionó. Anti-PROD + doble guard OK.
  - **Constraints descubiertas** (source-grounded): carrier-zone requiere `zoneDetailsList` no vacío (409);
    carrier-area usa enums `areaType P/C/Z` + `opeType O/E/C` + `polygonList`; y **bugs de robustez backend
    BE-11/12/13** (NPE en otherCosts/search por `apply` null vía Oracle ''→NULL; IOOBE en
    specialRateTrigger create-no-persiste + get(0); NPE en serviceTypes/create por null unboxing).

## Criterio de done

Cada artefacto pasa de "validado estático" a "validado por ejecución" cuando corre contra un
entorno real (**UAT preferido**) y sus asserts pasan o los fallos quedan triados (bug/dato/permiso).
