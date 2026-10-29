# Backlog — magiis-api-e2e

Estado de desarrollo. Fuente de verdad de contratos: `docs/reference/backend-endpoints-v1.72.2.md`.

> **Cobertura medida** (`npm run coverage` → `docs/reference/coverage-report.md`, 2026-07-14):
> 255/802 ops del contrato con test (**GET 225/373 = 60%**; mutaciones vía harness). FE-usados: 385,
> con test 113, gap 272 (mayormente mutaciones pendientes de harness).

## Estado actual (snapshot 2026-07-12)

- **Ejecución: LOCAL-ONLY.** Los test cases se corren localmente (`npm test`, `npm run test:*`), no en CI. Los workflows de GitHub Actions (`api-tests.yml`, `k6-tests.yml`) son escape hatches manuales opcionales (`workflow_dispatch`), no la vía primaria.
- 63 specs de controller. Con asserts read-only reales: **28 controllers** (17 previos + carrier-user, client, contractor-account, vehicle, recurring-trip, vendor, affi-agreement, carrier-concept-tax, carrier-account-solicitude, magiis-services-cost, whatsapp-business) + 4 flows. Harness de mutación: 7 controllers (guarded). Restan ~20 controllers MUTATING-HEAVY (cobertura vía harness, con luz verde) + ~15 menores (1 GET).
- **Nota**: al reescribir los 11 stubs a read-only se removieron sus placeholders `fixme` de mutación (rutas rotas auto-generadas); esas mutaciones se cubren por el rollout del harness, no como stubs.
- `openapi.yaml` **reconciliado**: 400 → **695 paths / 726 operaciones** (~95% de los 767 del doc).
- Swagger UI y OpenAPI MCP operativos.
- k6 scaffold + workflow CI opt-in (`k6-tests.yml`) operativos.

---

## ✅ B — OpenAPI + Swagger + MCP (HECHO 2026-07-12)

- [x] Fix del generador OpenAPI (crash `Invalid URL` de `postman-to-openapi@3.0.1`).
- [x] `scripts/sanitize-postman-snapshot.ts` — saneador: quita query vacíos, excluye
      requests sin ruta (345) y de otros servicios (106), reporta gap en `MAGIIS-API.broken.json`.
- [x] `npm run generate:openapi` → `openapi.yaml` (384 paths / 395 operaciones).
- [x] `npm run serve:swagger` → Swagger UI local (`swagger-ui-watcher`, puerto 8088).
- [x] MCP `openapi` en `.mcp.json` (`mcp-openapi-schema-explorer`, read-only).
- [x] Fix colateral: symlinks pnpm colgados (proyecto movido a `automation-projects/`) → reinstall.

Comandos:

```bash
npm run catalog:from-be     # regenera el catálogo de rutas desde el source de magiis-be (ground truth)
npm run sanitize:snapshot   # solo sanea el snapshot y reporta gap
npm run generate:openapi    # sanea + repara + genera openapi.yaml
npm run serve:swagger       # Swagger UI en http://localhost:8088
```

### ✅ B2 — OpenAPI desde source (HECHO 2026-07-13)

`scripts/generate-openapi-from-source.ts` (`npm run generate:openapi`) genera el spec desde el
código fuente de `magiis-be` (reemplaza al pipeline snapshot, ahora `generate:openapi:snapshot` legacy).

- [x] Parseo de controllers: `@*Mapping` + `@PathVariable`/`@RequestParam` (Optional→opcional) + `@RequestBody` + `ResponseEntity<Page/List/DTO>`.
- [x] Resolución de DTOs/entities Lombok → `components.schemas` (transitiva, con corte de ciclos; enums inline).
- [x] `openapi.yaml`: **737 paths / 802 operaciones / 601 schemas** · 0 IDs literales · **0 `$ref` rotos** · determinista.
- [x] Validado: schemathesis colecta **802 tests**; Swagger + MCP consumen el nuevo spec.
- Limitación: 9 tipos externos (MultipartFile, Google Maps, enums de `security/`/`engines/`) quedan como `{}` (any) — ampliable si se agregan esos paquetes al índice.

---

## 🔜 A — Doc backend como fuente de contratos (EN CURSO)

**Objetivo:** reconciliar el snapshot Postman contra los 767 endpoints reales y subir
la cobertura efectiva de tests.

- [x] Registrar doc backend v1.72.2 como fuente de contratos (`docs/reference/`).
- [x] Convertir batch de stubs read-only a specs reales con rutas corregidas + asserts
      (6/15: transport, operation-characteristic, versions, places, affiliate-profile,
      able-to-use-contractor). Confirmado: los stubs tenían **rutas rotas** por el snapshot corrupto.
- [x] **Reconciliar rutas** de los requests rotos vía catálogo `handler→ruta`
      (`scripts/backend-route-catalog.json`, 25 controllers, 332 rutas del doc). **336 reparadas**
      → `openapi.yaml` de 400 a **726 operaciones**. Solo 9 irreducibles (name `endpoint`).
- [ ] Copiar el `.md` completo a `docs/reference/backend-endpoints-v1.72.2.full.md`.
- [x] **Cobertura read-only real** (batch 1, 2026-07-14): 5 controllers — multi-region (11), billing (15),
      checking-account (7), carrier-rate (5), carrier-areas (2).
- [x] **Cobertura read-only — TODOS los stubs expandibles** (batch 2, 2026-07-14): 11 controllers —
      carrier-user, client, contractor-account, vehicle, recurring-trip, vendor, affi-agreement,
      carrier-concept-tax, carrier-account-solicitude, magiis-services-cost, whatsapp-business.
      Solo GET, asserts de shape desde `openapi.yaml`, tolerancia para ids derivados. Verify adversario pass.
      **Cobertura read-only cerrada** para todos los controllers GET-ricos (28/63).
- [x] **Cobertura read-only de los GET de los 24 controllers restantes** (batch 3, 2026-07-14):
      liquidaciones (contractor/user/owner/driver), api-integration, data, magiis-access, affi-checking-account,
      vehicle-owner, contractor-employee, contractor-user, card, service-types, special-rate-trigger,
      carrier-zone, cost-center, driver-user, owner-portal, affi-ostravel, contractor-area, relation,
      odn, mailchimp, flights. **~110 tests GET**; tolerantes `[200,400,403,404]` (detectan 5xx). Verify pass.
      → **Cobertura read-only CERRADA para todos los controllers con GETs** (~52/63). `controllers/` es read-only;
      quedan 13 specs POST/mutation-dominados (user/auth, quote, dashboard-vía-POST, payment, test, solicitudes,
      emergency, mapper, cron) cuya cobertura real es vía harness.
- [x] **Validado por ejecución (PROD smoke read-only)**: flows + config + multi-region → 19 passed / 2 skipped.
- [x] **Triage de los 54 archivos con `fixme`/`skip`** (271 casos) → `docs/reference/fixme-triage.md`.
      265 mutating-guard legítimo · 2 bugs backend a ticketear · rutas corregidas con codemod
      (`scripts/fix-spec-routes.ts`, **201 rutas** consistentes con `openapi.yaml`). Pendiente:
      harness de mutación segura (create→verify→cleanup) con luz verde para un-`fixme` el bloque mutating.
- [ ] Decidir si los 106 endpoints "de otro servicio" (gateway MGW / API pública)
      salen del scope o van a un spec separado.

**Criterio de done:** ~~`openapi.yaml` cubre ≥ 700/767~~ ✓ (726) · ≤ 5 stubs restantes · cada `fixme`
con causa documentada (link a HANDOFF/bug).

---

## 🟡 C — k6 (performance/carga) (SCAFFOLD HECHO 2026-07-12)

**Objetivo:** subproyecto de carga contra los flujos críticos, aislado del suite funcional.

- [x] Estructura `k6/`: `smoke.js`, `load.js`, `stress.js` + `lib/config.js` + `lib/auth.js`.
- [x] Escenarios sobre flujos críticos: auth/login, `carriers/{id}`, travels paginated,
      `config/serverInfo` (público). Reusan IDs/creds de env como el suite Playwright.
- [x] Thresholds `http_req_duration p(95)<800`, `http_req_failed<1%` en los 3 scripts.
- [x] Scripts npm `k6:smoke` / `k6:load` / `k6:stress`. `reports/k6/` cubierto por `.gitignore`.
- [x] `k6/README.md` con instalación, env vars, comandos y nota OPT-IN.
- [x] Workflow CI **opt-in** dedicado (`.github/workflows/k6-tests.yml`, `workflow_dispatch`) —
      escape hatch manual opcional; la vía primaria de ejecución es LOCAL.
- [x] **k6 instalado (v2.1.0) + validado por ejecución**: `k6/latency.js` (`npm run k6:latency`) contra
      PROD read-only, carga baja (5 VUs/20s) → **481 req, 0% fallos, p95 256ms / p99 360ms**. `load`/`stress`
      reservados para **UAT** (no cargar prod). Config prod-ready (fix de prefijo vacío en `k6/lib/config.js`).
- [x] **Reutilizar `openapi.yaml` para derivar endpoints** (backlog C): `scripts/gen-k6-endpoints.mjs`
      (`npm run k6:gen-endpoints`) genera `k6/lib/endpoints.generated.json` (146 GET read-only:
      50 sin path param + 96 con solo `{carrierId}`) + escenario `k6/read-sweep.js` (`npm run k6:sweep`).
- [ ] Primera corrida real contra **UAT** (`.env.uat`) **en local** (requiere luz verde del QA Lead).

**Notas de scope:** k6 vive fuera del alcance funcional (SCOPE.md prohíbe carga sistemática
en este suite). k6 corre como binario externo (no npm); env vars vía `-e` o entorno.
Ejecución LOCAL por defecto (ver política en "Estado actual").

**Performance en PROD — propósito único (política 2026-07-15):** la performance en **producción** existe
**solo** para **hallar el punto de quiebre del motor de DB** (stress controlado hasta degradación de la base),
como insumo para **estrategias de mejora e implementación bajo mejora continua**. NO es carga rutinaria ni
funcional. Gate: luz verde + ventana coordinada + monitoreo DB en vivo + criterios de corte + informe →
backlog de mejoras. El baseline funcional/carga corre en **UAT**. (Ver `docs/SCOPE.md`.)

**Criterio de done:** `smoke.js` corre en **local** y valida thresholds sobre 4 flujos críticos.

---

## 🟡 D — Schemathesis (contract fuzzing) (SCAFFOLD HECHO 2026-07-12)

**Objetivo:** fuzz contract-driven sobre `openapi.yaml` (subproyecto Python `schemathesis/`).

- [x] Subproyecto `schemathesis/`: `conftest.py`, `test_contract.py`, `pytest.ini`, `requirements.txt`, `README.md`.
- [x] Carga el spec con `schemathesis.from_path("../openapi.yaml")` + `@schema.parametrize()` (1 test por operación).
- [x] Auth JWT reusando la convención del suite (login + Bearer); skip si no hay creds.
- [x] Validado sin backend: `pytest --collect-only` → **726 tests colectados** (schemathesis 3.39.16, venv en `schemathesis/.venv`).
- [x] `.gitignore`: `.venv/`, `.hypothesis/`, `__pycache__/`.
- [ ] Primera corrida real contra **UAT** (`.env.uat`) **en local** (OPT-IN: requiere luz verde del QA Lead).
- [ ] Triage de hallazgos del fuzz → bugs de contrato del backend.

**Notas:** LOCAL-ONLY, no pegarle al backend sin luz verde. Fijado a schemathesis 3.x
(la 4.x cambió la API de carga del schema). Reportes → `reports/schemathesis/`.

**Criterio de done:** corrida local sobre un subset de endpoints críticos con hallazgos triados.

---

## ✅ E — Sesión 2026-07-14 (source completo + siguientes pasos)

Con los 5 repos cliente + backend disponibles localmente en `Escritorio/magiis's_repos/`:

- [x] **Análisis de uso FE↔BE multi-cliente** (`docs/reference/fe-endpoint-usage.md` + `-pax.md`):
      unión carrier×2 + driver = 357/717; pax (call-site `urlMapper`) = 59 mapeados. Veredicto de
      los 2 bugs = **vivos**; deprecados verificados (reportNumericLocation VIVO en driver).
- [x] **Mapa de uso FE CERRADO** (2026-07-15, `scripts/parse-fe-usage.mjs` reproducible): `magiis-fe`
      segmentado por portal (carrier 76, contractor 28, admin 11, owner 8, otros 226) + carrier-v2 94 +
      driver 44 → **unión command-URL 375/717**; pax +31 único → **gran unión 406/717 (57%)**.
      Dead-code candidatos = **311** (límite superior; excluye llamadas http inline).
- [x] **Deprecados en el spec**: generador lee `@Deprecated` del source → **4 ops** con
      `deprecated: true` (`quotes/simulate`, `payments/movement/{}/invalidate`,
      `carriers/rate/{}/rule`, `users/{}/cards/app/{}`). reportNumericLocation NO marcado (no anotado).
- [x] **Clientes TS generados** (`npm run generate:types`, `openapi-typescript@7.13.0`) →
      `tests/generated/magiis-api.d.ts` (802 ops tipadas, gitignored, regenerable).
- [x] **Harness de mutación** (7 controllers): `docs/reference/mutation-harness.md` +
      `tests/specs/_mutation/*.mutation.api.test.ts` → carrier-zone, carrier-area, contractor-area,
      carrier-other-cost, carrier-service-types, special-rate-trigger, client (este gated por seed).
      Patrón create→verify→cleanup, doble guard ALLOW_MUTATIONS + anti-PROD, cleanup idempotente en finally.
      Seed vars opcionales documentadas en `.env.example`.
- [x] **Harness rollout batch-2** (12 controllers total): + carrier-concept-tax, contractor-employee,
      contractor-user, carrier-user, magiis-access. Verify adversario pass. Ejecución real pendiente (**UAT** + luz verde).
- [x] **Setup PROD**: `.env.prod` (base `api.apps.example.com` **sin** prefijo de versión) +
      `runtime.ts` soporta prefijo vacío. Solo lecturas; mutaciones auto-bloqueadas en prod.
- [x] **Gap `cards` RESUELTO (no es bug)**: el BE expone `passengers/{}/cards/{cardId}` (DELETE) y
      `.../default` (PUT) como **alias en array** (`@DeleteMapping(value={ "users/...", "passengers/..." })`).
      El FE está correcto; `openapi.yaml` tiene ambas rutas; solo `backend-route-catalog.json` guardó el
      primer alias (`users/`) → falsa alarma del cruce pax. `openapi.yaml` es la fuente completa.
- [x] **Verificado en PROD** (`scripts/verify-prod-bugs.ts`, read-only): `travels/paginated` **500
      REPRODUCE** en carriers 1040 y 2741 (defecto global, 2 causas: SQLGrammarException + "No value present").
      `admins/paginated` con carrier → 200 (no el 500 esperado) → Spike de acceso. Ticket Bug 1 listo para Jira.

## ✅ F — Ejecución completa en PROD + triaje por ground-truth (2026-07-15)

Se corrió la suite read-only completa contra PROD (carrier 1040) e iteró hasta verde/skip-conocido.

**Progresión de corridas (read-only, PROD):**

| Corrida | passed  | failed | skipped | Acción                                                         |
| ------- | ------- | ------ | ------- | -------------------------------------------------------------- |
| #1      | 133     | 51     | 123     | baseline; 47/51 = test-gap (faltaban page/size/column/sort)    |
| #2      | 191     | 29     | 75      | tras workflow params (page:1/size/column/sort)                 |
| #3      | 204     | 2      | 89      | tras fix-29 (find:'' / fixme / readJsonSafe / enum / tolerate) |
| #4      | (final) | 0      | —       | tras fixme de los 2 bugs backend remanentes                    |

**Ground truth capturado contra prod** (`scripts/probe-prod-failures.ts`, read-only, login único):
el backend es **1-indexed** (`page:0` → 500 "Page index must not be less than zero"); el grueso de
los 500 era **anti-patrón backend**, no test.

### Hallazgos backend confirmados en PROD (para Jira)

Todos reproducidos en PROD, carrier 1040, read-only (cumple precondición de bug preexistente).

| #     | Endpoint(s)                                                                                                             | HTTP        | Causa backend                                                                                                                                                                                                                                          | Clase           |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| BE-1  | `passengers/{id}/travels/paginated` (Bug 1 previo)                                                                      | 500         | SQLGrammarException (column) + "No value present" (Optional.get)                                                                                                                                                                                       | **sistémico**   |
| BE-2  | checking `owners/paginated`, `carrier/{id}/contractors/paginated`, `carriers/{id}/clients/paginated`                    | 500         | `Optional.get(find)` **unguarded** → "No value present" (200 al enviar `find:''`)                                                                                                                                                                      | **sistémico**   |
| BE-3  | `api/applications/paginated`                                                                                            | 500         | `JpaSort.unsafe(sort,"("+column+")")` con column inválida (default BE=`userType`) → SQLGrammarException + `countryId.get()` unguarded (ApiIntegrationController L347/353/355)                                                                          | **sistémico**   |
| BE-4  | `carrierUserLiquidations/findCarriers/{passengerUserId}/paginated` (getCarriersWithLiquidations)                        | 500         | Internal Server Error con pid válido (105) + params; no lo arregla `find`                                                                                                                                                                              | a investigar    |
| BE-5  | `carriers/{carrierUserId}/vehicleOwners` (getWithoutOwner)                                                              | 500         | Internal Server Error; la variante `/paginated` sí 200 → inconsistencia                                                                                                                                                                                | inconsistencia  |
| BE-6  | `billing/admin/withoutLiquidations/{carrierId}/{to}/paginated`                                                          | 500         | DataException "could not extract ResultSet" (SQL)                                                                                                                                                                                                      | SQL             |
| BE-7  | `billing/carriers/{carrierAccountId}/travels`                                                                           | 500         | NullPointerException                                                                                                                                                                                                                                   | NPE             |
| BE-8  | `affiliateAgreement/paginated`                                                                                          | 404         | TransactionException / errorCode `AFFILIATE_AGREEMENT_BAD_DATA` (feature no config p/1040)                                                                                                                                                             | feature/data    |
| BE-9  | `magiisServicesCost/search` (sin body), `securityrolemagiisaccess/{enum}`, `places/checkPlace/{id inválido}`            | 500         | 500 en vez de 4xx sobre input inválido                                                                                                                                                                                                                 | robustez        |
| BE-10 | `odn/{id}/providers/GNET`, `.../driversLocations` (500), `.../vehiclesTypes` (409), `vendor/mailchimp/{id}/lists` (500) | 500/409     | integración externa (GNET/Mailchimp) sin config p/carrier 1040                                                                                                                                                                                         | config externa  |
| BE-11 | `POST carriers/{id}/otherCosts/search`                                                                                  | 500 (NPE)   | `CarrierOtherCostService:89` hace `coc.getApply().split(";")` sin null-check; un otherCost con `apply` NULL (Oracle guarda `''`→NULL) lo dispara al serializar la fila. Descubierto por ing. inversa en UAT.                                           | robustez (NPE)  |
| BE-12 | `POST carriers/{id}/specialRateTrigger/create` + `GET .../{id}`                                                         | 500 (IOOBE) | `create` devuelve id pero **no persiste** filas si `daysSchedule`/`periodSchedule` vienen vacíos; luego `getById` hace `list.get(0)` sobre lista vacía → IndexOutOfBounds (`SpecialRateTriggerService:223`). Además `create` ignora `request.enabled`. | robustez/lógica |
| BE-13 | `POST carriers/{id}/serviceTypes/create`                                                                                | 500 (NPE)   | `CarrierServiceTypeService:202` `getVehicleTypesOnDemand().size()` y `:524` `defineStep` desempaquetan null si el body omite `vehicleTypesOnDemand`/`vehicleTypeOnDemandAll`.                                                                          | robustez (NPE)  |

> Nota: BE-11/12/13 (+ los 409/validaciones de carrier-zone "zone details no vacío" y carrier-area
> enums `P/C/Z`·`O/E/C` + polygon) se descubrieron por **ingeniería inversa del source de magiis-be**
> mientras se endurecía el harness de mutación (create→verify→cleanup verde en UAT). Los 409/validaciones
> son contratos de negocio legítimos (documentables); BE-11/12/13 son bugs de robustez (500 con input
> válido-por-contrato que el FE no envía).

> **Headline:** BE-1/BE-2/BE-3 comparten el MISMO anti-patrón: `@RequestParam Optional<X>` +
> `.get()` sin `isPresent()`/`orElse()`, y `JpaSort.unsafe` inyectando `column` crudo en `ORDER BY`.
> El "Bug 1" (travels/paginated) **no es aislado** → es un caso de un patrón sistémico de paginación.
> Sin impacto para el usuario final (el FE siempre manda los params), pero es fragilidad + superficie
> de crash ante cualquier cliente que omita un opcional.

### Fixes de test aplicados (suite queda verde/skip-conocido)

- **Enviar los params que manda el FE real** (`find:''`) a los paginados con `Optional.get(find)` → BE-2 resuelto en test.
- **`test.fixme` + comentario con causa** en los bugs backend genuinos (BE-3/4/5/6/7/8) y externos (BE-9/10):
  skip-conocido, trazado, **sin enmascarar** (no se agregó 500 a sets tolerantes).
- **Enum válido**: `securityrolemagiisaccess` enviaba `ROLE_CARRIER`; el enum `MagiisRole` no tiene prefijo → `CARRIER`.
- **`readJsonSafe`** (helper nuevo): endpoints que responden 200 con cuerpo vacío (o vacío intermitente
  bajo concurrencia en prod) ya no rompen `.json()`.
- **`expectNestedPageShape`** (helper nuevo): `billing/admin/liquidations/paginated` devuelve `{page:{content}}`.
- **Tolerar** 404/401 data/env-dependientes: `carrierUser/{id}` (id derivado ≠ clave), travel `722494` (dato de TEST).

## Próximas etapas

- **Ticketear los hallazgos BE-1..BE-10** en Jira (BE-1/2/3 como un ticket sistémico de paginación).
- Spike de acceso `admins/paginated` (carrier → 200): confirmar rol real de la cuenta / broken access control.
- ✅ **Ejecución real en UAT (2026-07-15)**: suite read-only 205/1/98, k6 smoke (p95 472ms + Bug 1
  reproduce), harness de mutación (2 full-green, residuo 0). Detalle en `docs/reference/validation-plan.md`.
- ✅ **Harness-hardening (2026-07-15, ing. inversa del source BE)**: los 6 create arreglados con
  constraints deducidas del código → **harness UAT 8/8 controllers no-seed en verde** (create→verify→cleanup),
  **residuo 0** (verificado otherCosts + carrierUser). Reveló bugs backend BE-11/12/13 (§F) + contratos de
  negocio (carrier-zone zone-details, carrier-area enums+polygon).
- **Schemathesis en UAT** (aún pendiente): `pytest` sobre un subset con creds `.env.uat` + luz verde → triar.
- **Seed vars para los 4 mutation skipped** (client, contractor-area/employee/user): definir
  `MAGIIS_TEST_CONTRACTOR_ID` + seeds en `.env.uat` para cerrar el harness (12/12).
- Rollout del harness de mutación al resto de controllers CRUD (en UAT).
- (Opcional) Confirmar dead-code: auditar llamadas http inline (fuera de `_commandUrl`) para bajar el
  límite superior de 311 candidatos.
