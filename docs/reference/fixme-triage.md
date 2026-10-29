# Triage de `fixme`/`skip` — magiis-api-e2e

Triage de la deuda de tests desactivados (Workstream A3). Fecha: 2026-07-13.
Fuente de rutas/contratos: `docs/reference/backend-endpoints-v1.72.2.md` + `scripts/backend-route-catalog.json`.

## Resumen

**271 `fixme`/`skip` en 54 archivos.** Contra la lectura inicial ("deuda sin triar"), el
análisis muestra que es casi todo **guard legítimo de mutación**, no tests rotos sin causa.

| Categoría               | Cant. | Naturaleza                                                                    | Acción                                                                                                      |
| ----------------------- | ----- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **mutating-unsafe**     | 265   | POST/PUT/DELETE que mutan datos; `test.fixme` hasta tener body + dato de test | Correcta por diseño. Ruta ya corregida (ver abajo). Ejecutar con harness create→verify→cleanup + luz verde. |
| **backend-bug**         | 2     | GET que devuelve 500 (debería 4xx) — bug real del backend                     | Mantener `fixme` con link al bug; **ticketear**.                                                            |
| **missing-data-body**   | 1     | PUT que requiere DTO body + dato de test (affiliate-profile)                  | Completar body desde el doc §8.46 cuando haya dato.                                                         |
| **skips condicionales** | ~3    | `test.skip(cond, ...)` runtime (sin dato para derivar id) — NO son deuda      | Correcto; se auto-activan si hay dato.                                                                      |

## Acción ejecutada: corrección de rutas (codemod)

Los stubs mutating heredaron **rutas rotas** del snapshot corrupto (`getJson('')`,
`postJson('?x=', {...})`, `putJson('{id}', ...)`). Se corrigieron con
`scripts/fix-spec-routes.ts` (join `Controller + "VERB handler" → ruta` del catálogo):

- **201 rutas reemplazadas** en 37 archivos → ahora consistentes con `openapi.yaml`.
- **7 sin match**: los mismos `endpoint` irreducibles (perdieron el handler en el snapshot):
  `CarrierDriverLiquidation` POST · `CarrierOwnerLiquidation` POST ×2 ·
  `CheckingAccount` POST ×3 · `MultiRegion` GET.
- Los tests siguen en `test.fixme` (la corrección es solo de la **ruta**, no habilita mutación).

Re-ejecutable e idempotente: `npx tsx scripts/fix-spec-routes.ts [--dry]`.

## Bugs de backend a ticketear

| Endpoint                               | Handler               | Síntoma                            | Ref                                          |
| -------------------------------------- | --------------------- | ---------------------------------- | -------------------------------------------- |
| `GET /admins/paginated`                | `getAdminsPaginated`  | 500 con ROLE_CARRIER (debería 403) | admin-user.api.test.ts:14 · smoke 2026-05-28 |
| `GET /carriers/{id}/travels/paginated` | `getTravelsPaginated` | `SQLGrammarException` en query JPA | flow 03 · HANDOFF.md §11 (2026-06-09)        |

**Confirmado vivos (no deprecados):** análisis FE↔BE (`docs/reference/fe-endpoint-usage.md`) — ambos
los usa la plataforma carrier. Ninguno es `@Deprecated`.

**Verificación PROD 2026-07-14** (`scripts/verify-prod-bugs.ts`, read-only, `api.apps.example.com`, carrier 2741):

- `travels/paginated` → **HTTP 500 — REPRODUCE EN PROD en carrier 1040 Y 2741** (no es dato-específico → probable defecto global de la query). Dos causas: con `column`/`sort` → `SQLGrammarException`; sin ellos → `"No value present"` (`Optional.get()` sin default en TravelController). Bug real y vivo → Bug Jira, prioridad alta.
- `admins/paginated` [ROLE_CARRIER] → **HTTP 200** en PROD. Cuenta confirmada **carrier puro** (JWT:
  `roles=ROLE_CARRIER`, `user_access` solo códigos del portal carrier, sin admin) → **BROKEN ACCESS
  CONTROL confirmado**: un carrier lee la lista de administradores. Esperado 403. **Bug de seguridad,
  severidad Crítica** (reproduce en PROD con cuenta no privilegiada). Escalar como Bug, no Spike.

## Camino para el bloque mutating (265)

No se pueden un-`fixme` sin: (1) **body** del DTO (está en el doc, columna Entrada `@RequestBody`),
(2) **dato de test** creado/aislado, (3) **luz verde del QA Lead** para mutar en TEST.

Próximo paso propuesto (tarea scoped): **harness de mutación segura** por controller —
patrón `create → assert (contrato) → cleanup`, con bodies derivados del doc y datos de test
sembrados/limpiados. Priorizar por criticidad: travel, liquidaciones, pagos, carrier-account.

**Criterio de done A3 (cumplido):** cada `fixme` categorizado con causa; rutas corregidas;
bugs backend listados para ticket. Un-`fixme` masivo queda como tarea de harness (con green light).
