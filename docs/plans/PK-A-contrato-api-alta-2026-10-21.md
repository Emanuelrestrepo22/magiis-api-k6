# Plan de implementación · PK-A · Contrato API de alta y cotización con una moneda · 21/10/2026

> `/test-automation` Fase 1 (Plan). **Sin código.** Requiere aprobación antes de la Fase 2.
> Repo `magiis-api-e2e` · rama `test/TM-1285-contrato-api-f2` (HEAD `3c50514`) · worktree `C:\dev\wt\api-contrato` · ATP de automatizaciones **TM-1283**.
> Tests: TM-1367, TM-1424, TM-1426, TM-1395, TM-1431, TM-1394, TM-1416 (7 Tests, 6 ATC nuevos + 1 oráculo DB).
> Fuentes: ROI 21/10 (§PK-A, R15, Q1), PLAN/SOLUCION-CONTRATO-API 19/10, `w-api/*/RESULTADO.md` 20/10, Gherkin vivo de cada Test (`xray test get`), código del worktree y lecturas SELECT en TEST (conector 5de5b89d, solo lectura) del 21/10.

## 0. Resumen ejecutivo

| Tema | Decisión |
|---|---|
| Ambiente | **TEST, carrier 1521** (misma excepción que ya usan los 6 specs del 20/10). Q1 resuelta por código y corrida; falta solo formalizar la política (PR `docs/` aparte, no bloquea). |
| Criterio de release que protege | Carriers de venta con una sola moneda no se rompen: alta/cotización sin `currencyId` conservan moneda e importes (TM-1367, TM-1424, TM-1426); resolución del tarifador del empleado (TM-1395, TM-1431); límite de CC (TM-1394); copia al histórico (TM-1416). Costo y bimonetario no están habilitados en PROD: **no se agregan filas de costo/bimonetario** (se difieren a F7). |
| Componentes nuevos | 1 (`ContractorAccountApi`, para el límite de CC) + 1 helper DB (`travelHistoryOracle.ts`). El resto **extiende** `TravelsApi` y los specs existentes (Regla 12). |
| ATC nuevos | 6, en `TravelsApi` (5) y `ContractorAccountApi` (1 acción de preparación sin `@atc`). Ver §4. |
| Esfuerzo | **3,75 d** (el ROI estimaba 3 d; la diferencia es TM-1394 y TM-1416, que no son filas baratas). |
| ATR | **Propuesta: ATR nuevo de automatización colgado de TM-1283** (no TM-1361, no TM-1285). Ver §7. No se crea aquí. |
| Bloqueo duro | Ninguno para empezar. Dos puntos a validar antes de codificar TM-1394 y TM-1416 (ver §9). |

## 1. Q1 — Ambiente (resuelta)

**Respuesta: los specs de contrato-api ya corrieron contra TEST, carrier 1521. PK-A sigue exactamente lo mismo.**

Evidencia:
1. `tests/specs/controllers/mg1004-currency-contract.api.test.ts` y los otros 4 specs del commit `3c50514` declaran en su cabecera «Runs target ENV=test (carrier 1521)» y hacen `test.skip(!isF2Env(), F2_TEST_ONLY_REASON)` (`tests/data/f2/index.ts`).
2. `reports/junit.xml` y `reports/xray-results.json` del 20/10 11:21 ART: 19 de 19 en verde, 6 keys, `info.testPlanKey = TM-1283`, sin `testExecutionKey`.
3. `evidence/test/contrato-api/red-*.json` registran `POST carriers/1521/...`.
4. Comando documentado en `w-api/TM-1423/RESULTADO.md`: `ENV=test XRAY=1 ALLOW_MUTATIONS=1 playwright test … --workers=1 --retries=0`.
5. Precedente de política: `docs/SCOPE.md` excepción de pagos (TEST solo para pasarelas) y la política de ambientes del portafolio («TEST con razón declarada: el dato existe solo en TEST»). Razón declarada aquí: tarifadores 6202/6203/6204, clientes 1522/1761 y empleados QA existen solo en TEST.

**Configuración ya cableada** (nombres de variables, sin valores), en `.env.test` (gitignored, presente): `ENV`, `BASE_URL`, `LOGIN_USER`, `LOGIN_PASSWORD`, `LOGIN_ROLE`, `MAGIIS_TEST_CARRIER_ID`, `ALLOW_MUTATIONS`, `ORACLE_HOST_TEST`, `ORACLE_PORT_TEST`, `ORACLE_SERVICE_TEST`, `ORACLE_USER_TEST`, `ORACLE_PASSWORD_TEST`. Opcionales ya usadas por `cancelTravel`: `MAGIIS_TEST_CARRIER_USER_ID`, `MAGIIS_TEST_CARRIER_NAME`.

**Falta (no bloquea):**
- Política escrita: `CLAUDE.md` §Ambientes, `docs/SCOPE.md` («falta crear `.env.test`» ya es falso), `.env.example` y `.agents/project.yaml` siguen diciendo «TEST fuera». Propuesta: PR `docs/` separado citando ADR-0002 y la decisión del QA lead 19/10 (opción (b) de SOLUCION-CONTRATO-API). **No va en esta rama de tests.**
- Ninguna variable nueva es necesaria para PK-A. Variable opcional a considerar para TM-1416: `GMT_HISTORY_LOOKBACK_DAYS` (por defecto 3), solo si se adopta el modo dinámico (§5.7).

## 2. Inventario y anti-duplicación (Regla 12)

`kata-manifest.json` del boilerplate **no registra `magiis-api-e2e`** (solo AuthApi/ExampleApi) y el repo no tiene manifest propio. Inventario real verificado a mano en el worktree:

| Componente existente | Qué aporta a PK-A | Acción |
|---|---|---|
| `tests/components/api/TravelsApi.ts` (406 l.) | `simulateAllRejectsCurrencyWithoutRate` (TM-1423), `sendTravelWithRawCurrencyId` (TM-1390), `createWithPaymentMethodOverride` (TM-1370), `cancelTravel` (limpieza), `findRequesterUserId`, tipo `TravelRequestEndpoint`, `ControlledErrorBody` | **Extender** con 5 ATC. Ninguna de las 7 keys figura hoy en un `@atc(...)` ni en el repo. |
| `tests/components/api/QuoteApi.ts`, `CarrierOtherCostApi.ts`, `FrequentDestinationApi.ts`, `CarrierRateApi.ts` | `QuoteApi` y `CarrierRateApi` que lista el ROI **no se usan en PK-A** (el ROI los citaba como candidatos; ningún Test de PK-A cotiza por `quotes/*`). `CarrierRateApi.findRateIdByName` sirve de Discover si hace falta. | Sin cambios. |
| `tests/components/db/OracleDb.ts` (+ `routeRowOracle.ts`) | Pata DB read-only (`db.query`, fixture `db`, `null` si faltan credenciales) | Reutilizar. `routeRowOracle.ts` es el patrón para el helper de TM-1416. |
| `tests/data/f2/{index,observe,pace}.ts` | `F2_EMPLOYEES`, `F2_NOTES`, `discoverEmployee`, `buildSimulateBody`, `buildCreateBody`, `observe` (adjunta `red-*.json`), `pace` (≥4 s entre llamadas), `isF2Env`, `F2_TEST_ONLY_REASON` | **Extender** (empleados McLaren, notas nuevas, baseline). |
| `tests/fixtures/apiFixture.ts` | Fixtures `travels`, `db`, `cfg`, `carrierRate`… | Registrar 1 fixture nuevo (`contractorAccount`). |
| `tests/utils/reporters/xray-reporter.ts` | `tms_only` exclusivo; **soporta multi-key**: `extractTestKeys` junta todas las annotations `tms_only` (varias `tms_only` en el mismo test acreditan varias keys). Verificado en código. | Sin cambios; agregar 1 caso al unit test (T8). |
| `tests/specs/controllers/mg1004-currency-contract.api.test.ts` (TM-1423, TM-1390) | Spec a extender (read-only) | Extender. |
| `tests/specs/_mutation/mg1007-create-cash-by-cost.mutation.api.test.ts` | Patrón de mutación con `afterEach` + `cancelTravel` | Plantilla de los specs nuevos de `_mutation/`. |

**Componente nuevo justificado:** `ContractorAccountApi` (dominio contractor: leer la compañía y cambiar `checkingAccountLimit`/`exceedingLimit`). Búsqueda en `tests/` de `updateCompany`, `contractor/{id}/carrier`: 0 coincidencias en componentes (solo el catálogo de rutas). No es duplicado.

**Ids de ATC:** `@atc('TM-1367')`, `@atc('TM-1426')`, `@atc('TM-1395')`, `@atc('TM-1394')` libres (grep sobre `tests/` y todas las ramas ya hecho el 19/10 y repetido hoy sobre el worktree). TM-1424 y TM-1431 **no tienen `@atc` propio**: comparten el ATC de su comportamiento y se acreditan con `tms_only` (ver §3).

## 3. Convención de crédito Xray (cómo se acreditan los 6 ya automatizados)

- Cada test declara `{ annotation: { type: 'tms_only', description: 'TM-n' } }`; gana sobre la key heredada del `@atc` compartido (commit `d9bf766`). Sin esto, los ATC compartidos de `TravelsApi` empujan `TM-945` y acreditan escenarios ajenos.
- **Multi-key**: `annotation: [{ type:'tms_only', description:'TM-1395' }, { type:'tms_only', description:'TM-1431' }]` (patrón de array ya usado en `carrier-other-cost-mx6052.api.test.ts`).
- El reporter se activa con `XRAY=1` (no pasar `--reporter=` por CLI: descarta el xray-reporter). Con `XRAY_EXECUTION_KEY` el JSON lleva `testExecutionKey`; sin él, `info.testPlanKey` (default **TM-1283**).
- **Hoy los 6 Tests del 20/10 NO tienen run en ningún ATR automatizado**: se publicó comentario Jira + evidencia (`w-api/*`) y el JSON `xray-results.contrato-api.json` quedó **sin importar** (decisión SOLUCION §3.3). TM-1361 no los contiene (verificado: 39 runs, ninguno de contrato-api).
- Regla de veredicto (doctrina «evidencia antes del veredicto»): comentario con lo ejecutado/obtenido + al menos un artefacto adjunto en el run, antes de cambiar estado. Mismo paquete `RESULTADO.md` / `DB.md` / `red-*.json` / tarjeta `*-api-card.png` que el 20/10.

## 4. Mapa Test → ATC → endpoint → oráculo → componente

Convención de oráculo: **Definido** = figura en el Gherkin vigente; **Derivado** = se lee en vivo de DB/API (nunca se hardcodea un importe que pueda derivar de datos); **Observado** = se registra y no se asierta.

| Test | Comportamiento (1 ATC por comportamiento) | ATC y componente | Endpoint(s) (de código/doc) | Oráculo | Filas |
|---|---|---|---|---|---|
| **TM-1367** (MG-1004-AC2, P1, smoke) | Request **sin** `currencyId` → 200, moneda del carrier, importes = baseline | `TravelsApi.sendTravelWithCarrierCurrency(carrierId, args)` `@atc('TM-1367')` (**nuevo**; omite la clave, o la envía null/número; aserciones fijas: 200, sin `errorCode`, cuerpo shape válido). Compartido con TM-1424. | `POST carriers/{c}/travels/simulate`, `/simulateAll`, `POST carriers/{c}/travels` (create) | API (simulate/simulateAll): `currency` = moneda del carrier (USD, `currencyId` 9 leído de DB), `carrierRateByCost=false`, `rateId`=6204 (descubierto), `pricePointToPoint` = baseline. DB (create): `TRAVEL.CURRENCY_ID`=9, `SIMULATIONPRICEI.CARRIERRATE_ID`=6204, `CARRIERRATE_BY_COST`=0, `PRICEPOINTTOPOINT`/`_COST` = baseline y = respuesta de simulateAll. | 3 (simulate, simulateAll, create) con Krief (CE 1922, 6204) |
| **TM-1424** (MG-1004-AC2, P2) | Mismo comportamiento con `currencyId` **null** y **= moneda del carrier (9)** → 200 idéntico al request sin campo | **Mismo ATC** `sendTravelWithCarrierCurrency` (partición distinta, mismo esperado) | igual | Respuesta de cada variante == respuesta del control sin campo (comparación campo a campo de los importes y `currency`); create: DB como arriba. Evidencia previa 16/10: viajes 71392 (null) y 71394 (9) → 6204, 42,65. | {null, 9} × {simulateAll, create} (simulate cubierto por TM-1367; se agrega solo si Dev lo pide) |
| **TM-1426** (MG-1004-AC3, P2) | `simulate` devuelve el mismo desglose que `simulateAll` para el mismo request | `TravelsApi.simulateReturnsSameBreakdownAsSimulateAll(carrierId, body)` `@atc('TM-1426')` (**nuevo**; llama a ambos endpoints con el mismo body desde un helper privado, sin llamar a otro ATC) | `POST …/travels/simulate` y `…/simulateAll` | Elemento de `simulateAll` con `transportTypeId` = `vehicleTypeId` del request vs objeto de `simulate`: `rateId`, `carrierRateByCost`, `currency`, `pricePointToPoint`, `pricePointToPointCost`, `totalCostPrice`, y `waitTotalPriceCost`, `taxiingCostPriceCost`, `fixConceptsCost`, `taxesCost` **presentes y = 0 (no ausentes)**. DB: 0 filas con la Nota (solo lectura). | Fila Krief/6204 (venta). **Fila 6203 (costo y venta) y 6202 (bimonetario) diferidas a F7** (regla de costo no habilitado en PROD) |
| TM-1426 (fila de contrato 409) | `simulate` con moneda sin tarifador → 409 `RATE_WITHOUT_CURRENCY` | `TravelsApi.simulateRejectsCurrencyWithoutRate(carrierId, body)` `@atc('TM-1426')` (**nuevo**, análogo a `simulateAllRejectsCurrencyWithoutRate` de TM-1423; se justifica porque difiere el endpoint, no se parametriza el existente para no cambiar un ATC ya publicado) | `POST …/travels/simulate` | **Definido** (Gherkin cabecera + N4 16/10): 409, `errorCode=RATE_WITHOUT_CURRENCY`. Moneda = `INVOICE_CURRENCY_ID` del 6202 (ARS) derivada en DB, igual que TM-1423 (no el literal 61). | 1 |
| **TM-1395** (MG-1004, P2, regresión) | Empleado sin cuenta propia usa el tarifador PERSONALIZED de su contractor | `TravelsApi.createResolvingContractorRate(carrierId, body)` `@atc('TM-1395')` (**nuevo**; aserciones fijas: 200 + `travelId`) | `POST carriers/{c}/travels` (create) | **Definido** (Gherkin + 15/10): DB `SIMULATIONPRICEI.CARRIERRATE_ID`=6203 (≠2261), `CARRIERRATE_BY_COST`=1, `PRICEPOINTTOPOINT_COST` ≠ `PRICEPOINTTOPOINT` (baseline 71320: 42,65 / 21,33). | Fila 1: colaborador «QA Fdos Empleado ConCC» (CE 2383, McLaren 1521). Fila 2: contractor con registro propio «Zak Brown» (CE 1921), importes = baseline 71200 (42,65 / 21,33) |
| **TM-1431** (MG-1004, P2, regresión) | Mismo comportamiento: empleado de contractor de **un solo carrier** usa el tarifador del contractor dentro del carrier del viaje | **Mismo ATC** (misma precondición y acción que la fila 1 de TM-1395) → multi-key `[TM-1395][TM-1431]` en esa fila | simulate, simulateAll (200, importes = baseline TM-1304) y create | Además de TM-1395: `COUNT(CONTRACTOR_CARRIERRATES)` del contractor 1521 **sin cambio** antes/después (Gherkin: «ninguna fila nueva»). | Fila 1 de TM-1395 (sin trip adicional) |
| **TM-1394** (MG-1004, P2, regresión) | `checkExceedingLimit` evalúa el saldo disponible de la CC según límite y «Permite exceder» | `TravelsApi.checkExceedingLimit(carrierId, args)` `@atc('TM-1394')` (**nuevo**; aserciones fijas: 200 y valor ∈ {EXCEEDED, NOT_EXCEEDED, ALLOWED_TO_EXCEED}). Preparación en `ContractorAccountApi.setCheckingAccountLimit` (acción de setup, **sin `@atc`**). | `GET carriers/{c}/travels/passenger/{passengerId}/checkExceedingLimit/CHECKING_ACCOUNT/Web` (openapi; `passengerId` = solicitante del cliente, `requesterUserId`, no el empleado; `currencyId` opcional, por defecto la moneda del carrier); preparación `GET contractor/{contractorAccountId}/carrier/{carrierId}` + `POST carrier/{carrierId}/updateCompany` (ContractorDTO) | **Definido** (Gherkin «Esperado corregido 15/10»): saldo = I+0,01 → NOT_EXCEEDED; saldo = I−0,01 → NOT_EXCEEDED (el control no usa el importe); saldo ≤ 0 con «Permite exceder» apagado → EXCEEDED. `I` se toma de `simulateAll` en vivo; saldo/límite/DEBITSUM se leen de `CHECKINGACCOUNT` (el DEBITSUM deriva: 958,60 el 15/10 → 1170,73 hoy). | 3 filas USD (las dos filas ARS 6202 quedan fuera: D-BE-5 sin definir y bimonetario) |
| **TM-1416** (MG-1537-AC5, P2) | El cierre GMT copia las 4 columnas de otros costos a `TRAVEL_HISTORY` | Sin ATC de API (no hay endpoint que dispare el cron). Oráculo DB read-only: `tests/components/db/travelHistoryOracle.ts` (patrón de `routeRowOracle.ts`) + spec en `controllers/`; la key se declara por `tms_only` en el spec. | Solo SELECT | **Definido**: 1 sola fila `TRAVEL_HISTORY` por viaje con `HISTORIC_EMISSION_DATE` informada; 4 columnas no NULL e iguales a las de `PRICEADDITIONAL` **tomadas antes del cierre** (ver §5.7). | Filas de referencia 71192 / 71212 / 71160 + modo dinámico |

## 5. Detalle por Test (datos, oráculo, riesgos)

### 5.1 Fixtures y datos comunes

- Empleado Krief: `F2_EMPLOYEES.krief` (CE 1922, contractor 1522, solicitante 10551, área 1142), único tarifador 6204 USD por venta. **Descubierto por nombre en DB, no hardcodeado** (patrón vigente).
- Empleados nuevos en `F2_EMPLOYEES`: `mclarenColab` (`QA Fdos` / `Empleado ConCC` / `McLaren%`; CE 2383, `ISCHECKINGACCOUNTENABLED=1`) y `mclarenOwn` (`Zak` / `Brown` / `McLaren%`; CE 1921). Verificado hoy por SELECT: ambos activos, sin `DELETIONDATE`.
- Ruta fija y fecha: `F2_ROUTE`, `F2_DATE_PROGRAMMED` (2026-10-22T14:00Z). **Revisar la fecha**: está en el pasado cercano al ejecutar después del 22/10; el backend rechaza fecha sin anticipación? (TM-508). Si falla por eso, derivar `dateProgrammed = hoy + 2 d` en `buildSimulateBody` (cambio en `data/f2/index.ts`, tarea T1).
- Notas nuevas en `F2_NOTES` (rastreables en `TRAVEL.NOTE`, patrón `QA F2F3 <tipo>`): `defaultCurrency` («QA F2F3 PKA T06»), `explicitCurrency` («QA F2F3 PKA T13»), `contractorRate` («QA F2F3 PKA T28»), `simulateParity` («QA F2F3 PKA T15»). Cada test agrega un sufijo de corrida para poder contar filas propias.
- **Baseline de importes** (nuevo `tests/data/f2/baseline.ts`): viajes de referencia del Gherkin, leídos **en vivo** de `SIMULATIONPRICEI`, no copiados como literales: 71305 y 71082 (6204 → 42,65 / 42,65), 71200 y 71320 (6203 → 42,65 / 21,33). Hoy confirmados en TEST (todos STATE 7, CURRENCY_ID 9). Si una fila de referencia no existe → `test.skip` con motivo; si el importe cambió porque se modificó el tarifador → falla legítima y se documenta (ver riesgo R-2).
- Pantalla vs API: el TM-1426 Gherkin trae 43,67 (venta) mientras el baseline medido es 42,65: **no se usa ningún literal**; el oráculo compara contra `simulateAll` y contra DB.

### 5.2 TM-1367 — alta y cotización sin `currencyId`

1. `beforeAll`/primer paso: `discoverEmployee(krief)`; leer baseline (71305/71082) y `CURRENCY_ID` del carrier (9) de DB.
2. `simulate` y `simulateAll` con `buildSimulateBody(...)` **sin la clave** `currencyId` (el builder no la emite hoy; verificar que `sendTravelWithCarrierCurrency` con `currencyId: 'omit'` no la serialice).
3. Aserciones: 200; sin `errorCode`; `currency` con código USD y `currencyId` 9; `carrierRateByCost=false`; `rateId` = id descubierto del 6204; importes = baseline.
4. `create` (spec en `_mutation/`, doble guarda `ALLOW_MUTATIONS=1` + no prod): 200 + `travelId`; DB del viaje creado = baseline y = importes de `simulateAll`; guardar para cancelar en `afterEach`.
5. Fila «app Pasajero» del Gherkin: **fuera** (dispositivo; manual).

Cobertura declarada como parcial: el Gherkin de TM-1367 tiene filas de UI y de app PAX; la automatización acredita la **partición de contrato** (request sin `currencyId` por API). Se declara en `xray_comment` para que el run no se lea como cobertura total (mismo criterio que R4 del ROI).

### 5.3 TM-1424 — `currencyId` null y = 9 explícito

- Parametrizar `[null, 9]` × `[simulateAll, create]` sobre Krief (6204). Oráculo: igual al control sin campo (**Definido**, Gherkin cabecera y N2 16/10). Control: la respuesta de TM-1367 del mismo test file (misma sesión) o una llamada de control propia (preferible: control dentro del mismo test, para no acoplar tests).
- El Gherkin retitulado habla de «tarifador predeterminado del cliente» D4 (6203 default); esa variante es de costo y queda **fuera**. Declararlo en `xray_comment`.
- Riesgo fuera del criterio (Gherkin): `null` explícito podría deserializarse como moneda 0. El test lo cubre (200 y misma moneda); si diera 4xx, es hallazgo de contrato, no se «arregla» el esperado.

### 5.4 TM-1426 — paridad simulate / simulateAll

- Solo lectura, sin datos propios: Krief, mismo `body` a ambos endpoints.
- Como `simulate` devuelve un objeto y `simulateAll` una lista por tipo de vehículo, se empareja por `transportTypeId` = `vehicleTypeId` del request (campo presente en `SimulationPriceInformationResponseDTO` del openapi). Los campos `currency`, `carrierRateByCost`, `pricePointToPointCost` **no están en `openapi.yaml`** (snapshot previo a F2): las aserciones usan tipos locales (`SimulationBreakdown`) definidos en `TravelsApi.ts`, no `tests/generated`. Registrar como hallazgo de contrato: regenerar OpenAPI desde `magiis-be` es otra tarea (`generate:openapi`), fuera de PK-A.
- Fila 409 de contrato con `simulate` y moneda sin tarifador: ver §4.

### 5.5 TM-1395 y TM-1431 — resolución del tarifador del empleado

- Un ATC (`createResolvingContractorRate`), dos filas de datos:
  - **Fila A** (CE 2383): acredita `[TM-1395][TM-1431]`. Pasos: precondición DB (`COUNT(PASSENGERACCOUNT)` del pasajero = 0; contractor 1521 con 6203 default; `CAR_CON_RELATION` del contractor con un solo carrier = TM-1431), simulate + simulateAll (200, importes = baseline 71320/71200), create (200), DB: `CARRIERRATE_ID`=6203, `CARRIERRATE_BY_COST`=1, `PRICEPOINTTOPOINT_COST`≠`PRICEPOINTTOPOINT`, y `COUNT(CONTRACTOR_CARRIERRATES)` del contractor sin variación.
  - **Fila B** (CE 1921 «Zak Brown»): acredita `[TM-1395]` (fila «contractor con registro propio»). Importes = baseline 71200.
- Mutaciones: 2 viajes, cancelados en `afterEach`. No toca el botón «A» ni asigna chofer (el body de `create` usa `isSpecialAssign` y no `driverProgrammedId`; verificar en T5 que el viaje queda en STATE 9 sin chofer, como en las corridas del 15-16/10).
- Este par es de **tarifador por costo (6203)** pero lo que se asierta es la **resolución de la tarifa** (id) y que las ventas no cambian; no se agregan aserciones de comisión ni de costo más allá de las del Gherkin. Si el QA lead prefiere sacarlo de PK-A por la regla «costo no habilitado en PROD», se mueve a diferido-F7 sin tocar el resto.

### 5.6 TM-1394 — límite de cuenta corriente

- **Mutación de dato compartido**: el único camino API que cambia el límite es `POST carrier/{c}/updateCompany` con el `ContractorDTO` completo. Estrategia obligatoria:
  1. Discover (solo lectura): `GET contractor/{contractorAccountId}/carrier/{carrierId}` + SELECT de `CHECKINGACCOUNT` (límite L0, `EXCEEDINGLIMIT` original, `BALANCE`, `DEBITSUM`).
  2. Guardar L0/`EXCEEDINGLIMIT` en una annotation del test (recuperables a mano si el proceso muere).
  3. Aplicar fila: límite = `DEBITSUM` + I ± 0,01, «Permite exceder» apagado (`exceedingLimit=false`).
  4. Esperar a que el saldo derivado (`BALANCE`) refleje el cambio por **condición observable en DB** (poll de SELECT con timeout; sin `waitForTimeout`).
  5. `checkExceedingLimit` con `passengerId` = **solicitante** (`CONTRACTORACCOUNT.PASSENGER_ID` = `requesterUserId`, dueño de la `PASSENGERACCOUNT` de la CC), **no** el empleado (`CONTRACTOR_EMPLOYEE.ID`): el control evalúa la cuenta del solicitante en el carrier y, si ese pasajero no tiene `PASSENGERACCOUNT` en el carrier, responde `NOT_EXCEEDED` sin mirar ninguna cuenta (falso verde). `currencyId` es query opcional; por defecto usa la moneda predeterminada del carrier (USD en 1521). Precondición DB del spec: exactamente 1 `PASSENGERACCOUNT` con `PASSENGER_ID` = solicitante, `CARRIERACCOUNT_ID` = carrier e `ID` = `CHECKINGACCOUNT.PASSENGERACCOUNT_ID`; asertar.
  6. `afterEach` (`finally`): restaurar L0 y `EXCEEDINGLIMIT` original y **verificar por SELECT** que quedaron restaurados; si no, fallar con el valor a reponer.
- **Ventana del job de saldo**: el 15/10 se evitó correr entre :40 y :50 de cada hora (el job de `BALANCE` corre en ese tramo; `DB.md` fila 7). El spec hace `test.skip`/espera por condición si el minuto UTC cae en ese tramo, parametrizable. A confirmar con Dev si sigue vigente (pregunta §9-P3).
- Sujeto de prueba: preferir un cliente **propio de QA** («QA F2 D3 Bimonetario», contractor 1761, empleado «QA Colab ConCC», CE 2385) para no tocar la CC de McLaren que usan TM-1395/TM-1431 y otros flujos; fallback McLaren/Zak Brown (CC 4885, hoy L0 = 10 000 000 y `EXCEEDINGLIMIT=1`, restaurada). **Se decide en T0** (depende de que 1761 tenga una CC en USD; no verificado, la consulta directa del vínculo contractor → CC no se pudo armar con las tablas inspeccionadas).
- **No se asierta que el alta se cree o no según el límite**: el 15/10 se midió que `create` no revalida (viaje 71315 creado con saldo < I). Codificarlo como esperado sería fijar un posible defecto como contrato (regla 18); queda como **observado** en `red-*.json` y como pregunta a Dev (P4). La fila «saldo ≤ 0» asierta solo `EXCEEDED`.
- Filas ARS 6202 (`currency_id` 1): fuera (D-BE-5 «Pendiente de definición» + bimonetario).
- Fila opcional «exceder permitido» (`exceedingLimit=true` con saldo ≤ 0 → `ALLOWED_TO_EXCEED` según el enum del openapi): sin oráculo en el Gherkin y no medida; se **mide en T0** y recién entonces se decide si se agrega.

### 5.7 TM-1416 — copia del cierre GMT a `TRAVEL_HISTORY`

Hallazgo de diseño (lecturas SELECT del 21/10 en TEST), que invalida el oráculo literal del Gherkin tal como está escrito:

- Tras el cierre GMT (22:00 ART = 01:00 UTC; última `HISTORIC_EMISSION_DATE` del carrier 1521 = 2026-10-19T22:00:05Z en la muestra), `TRAVEL.FINALPRICE_ID` queda **NULL** y la fila `PRICEADDITIONAL` **ya no es alcanzable** (ni por `TRAVEL.FINALPRICE_ID` ni por `TRAVEL_HISTORY.FINALPRICE_ID`: LEFT JOIN devuelve nulos para 71192, 71212 y 71160). Por lo tanto «iguales a PRICEADDITIONAL» solo se puede verificar con una **foto previa al cierre**.
- Valores de referencia del Gherkin **sí coinciden** con `TRAVEL_HISTORY` hoy (71192: 8/8/0/8; 71212: 19/9/10/9; 71160: 16/1/9/0; todas emitidas 2026-10-14T22:00:05Z, STATE 6).
- Tampoco se encontraron ítems en `TRAVEL_OTHERCOST_HISTORY` para esos tres `FINALPRICE_ID` (0 filas): el último «Then» del Gherkin (ítems de `TRAVEL_OTHERCOST_HISTORY` iguales a `TRAVEL_OTHERCOST`) no es verificable así. A aclarar (pregunta P2).

Diseño propuesto, de menor a mayor valor:

| Modo | Qué hace | Detecta regresión del job | Costo |
|---|---|---|---|
| **M0 estático** (mínimo viable, siempre) | Para 71192/71212/71160: 1 sola fila de `TRAVEL_HISTORY`, `HISTORIC_EMISSION_DATE` informada, 4 columnas no NULL e iguales a la tabla de valores del Gherkin | No (valores históricos congelados); sí detecta corrupción o backfill | 0,2 d |
| **M1 dinámico, 2 fases** | Fase 1 (antes de las 22:00 ART): SELECT y volcado a `evidence/test/contrato-api/gmt-snapshot.json` (gitignored) de `PRICEADDITIONAL` (4 columnas) de los viajes finalizados hoy del carrier 1521. Fase 2 (después del cierre): comparar contra `TRAVEL_HISTORY`. | **Sí** | +0,2 d y ejecución en dos momentos |

**Recomendación:** implementar M0 y M1 en el mismo spec; M1 se marca `test.skip` con motivo si no hay snapshot del día o si el cierre no corrió (`MAX(HISTORIC_EMISSION_DATE)` < hoy 01:00 UTC). El ROI hablaba de «helper run-window»: ese helper (`cv2-fr/tests/helpers/run-window.ts`) es de la **ventana de rendición de las 13:10 UTC**, no del cierre GMT, y vive en otro repo; no se reutiliza. La condición se resuelve con el propio SELECT (sin helper nuevo de ventana).
Solo lectura: no hay `ALLOW_MUTATIONS`. La key se declara con `tms_only` y la carga del hecho «corrido después del GMT» se anota en el `xray_comment`.

## 6. Datos y efectos laterales en TEST

| Test | Escribe | Cuánto | Limpieza |
|---|---|---|---|
| TM-1367 | 1 viaje (create) | 1 | `cancelTravel` en `afterEach`, aun si falla |
| TM-1424 | 2 viajes (null, 9) | 2 | idem |
| TM-1426 | nada | 0 | — |
| TM-1395/1431 | 2 viajes (CE 2383, CE 1921) | 2 | idem |
| TM-1394 | **límite y «Permite exceder» de una CC de QA** (0 viajes) | 3 filas × (guardar + restaurar) | `finally` + verificación SELECT de la restauración |
| TM-1416 | nada | 0 | — |
| **Total** | 5 viajes + 1 mutación reversible | | |

Reglas: carrier 1521 siempre (`cfg.carrierId`); **nunca** carrier 1040 ni datos ajenos (solo empleados QA nombrados arriba); sin chofer, sin autodispatch ni botón «A» (los bodies de `buildCreateBody` no asignan chofer; T5 verifica STATE 9 sin `DRIVER_ID`); `--workers=1 --retries=0`, ≥4 s entre llamadas (`pace()`); doble guarda `ALLOW_MUTATIONS=1` + `test.skip(cfg.env==='prod')`; un fallo del cancel no debe ocultar el fallo del test (patrón actual de `afterEach`). Los viajes quedan con Nota `QA F2F3 PKA …` para auditoría.

## 7. ATR (propuesta, no se crea)

**Propuesta: crear un ATR de automatización nuevo, colgado únicamente del ATP de automatizaciones TM-1283**, p. ej.
`ATR: Contrato API — alta, cotización y límite de CC (carrier 1521) — magiis-api-e2e — TEST`,
con las **13 keys** de contrato-api: las 6 del 20/10 (TM-1370, TM-1390, TM-1414, TM-1423, TM-1436, TM-1440) y las 7 de PK-A.

Razones:
1. **No existe** un ATR de contrato-api (las 6 corridas del 20/10 no se importaron; TM-1361 no las contiene).
2. **No TM-1361**: es el ATR del stock cv2 reutilizado (39 runs); importar ahí agregaría Tests que pertenecen a los ATR manuales TM-1286/1288/1292 = deriva de membresía (regla 18, SOLUCION §1.4). El ROI sugería TM-1361 «para el stock de cv2 y api» (PLAN-REGRESION T9); esa pauta es anterior a existir contrato-api y se corrige aquí.
3. **No TM-1285**: adjuntar el ATR al plan de release dejaría que «gana el run más reciente» pise los veredictos de los runs manuales (mismo riesgo que R2 del ROI con TM-1501).
4. Un ATR propio hace trazable el reporte con `XRAY_EXECUTION_KEY=<nuevo>` y mantiene el reporter sin cambios.

Alternativa B (sin ATR nuevo): repetir el procedimiento del 20/10 (comentario + evidencia en el run manual existente, JSON sin importar). Es válida, pero no deja estado agregado de la automatización. **Decisión que pide al usuario**; no bloquea la Fase 2.

Hasta que el ATR exista: se corre con `XRAY=1` **sin** `XRAY_EXECUTION_KEY` (JSON con `testPlanKey` TM-1283) y no se importa.

## 8. Desglose de tareas (≤3 archivos cada una, con verificación)

Orden y dependencias. Comandos del repo (pnpm; typecheck directo por `./node_modules/.bin/tsc --noEmit` para evitar el pre-install de pnpm; ver `CLAUDE.md`). Todo en el worktree `C:\dev\wt\api-contrato`; **sin commit hasta pedirlo** (formato `test(api): [TM-1367][TM-1424]… descripción`).

| # | Tarea | Archivos | Verify | Esfuerzo |
|---|---|---|---|---|
| **T0** | **Spike de lectura (sin código de producción)**: (a) medir la respuesta real de `simulate`/`simulateAll` de Krief sin `currencyId` y con `null`/`9` (campos `currency`, `carrierRateByCost`, `transportTypeId`); (b) decidir sujeto de TM-1394: ¿1761 tiene CC USD?, id de `CHECKINGACCOUNT` por contractor y forma del `ContractorDTO` del `GET contractor/{id}/carrier/{c}` frente al body de `updateCompany`; (c) medir `checkExceedingLimit` con `EXCEEDINGLIMIT=1`; (d) confirmar fecha programada válida; (e) confirmar P2 (ítems en `TRAVEL_OTHERCOST_HISTORY`). Escritura de estado solo con aprobación explícita para (c) (cambia un límite). | scratch fuera del repo | Notas en `docs/plans/` o comentario al usuario; decisiones cerradas antes de T2 | 0,25 d |
| **T1** | Capa de datos: empleados `mclarenColab`/`mclarenOwn`, notas nuevas, `dateProgrammed` dinámico si T0(d) lo exige, `baseline.ts` (lectura viva de los viajes de referencia), builder que permita **omitir** `currencyId` | `tests/data/f2/index.ts`, `tests/data/f2/baseline.ts` | `./node_modules/.bin/tsc --noEmit`; `pnpm lint`; `pnpm format:check` | 0,25 d |
| **T2** | ATC nuevos de `TravelsApi`: `sendTravelWithCarrierCurrency` (TM-1367), `simulateReturnsSameBreakdownAsSimulateAll` y `simulateRejectsCurrencyWithoutRate` (TM-1426), `createResolvingContractorRate` (TM-1395), `checkExceedingLimit` (TM-1394) + tipo `SimulationBreakdown` | `tests/components/api/TravelsApi.ts` | typecheck + lint + `playwright test --list` (los ATC no ejecutan sin spec) | 0,5 d |
| **T3** | Spec read-only: TM-1367 (simulate, simulateAll), TM-1424 (simulateAll null/9), TM-1426 (paridad Krief + fila 409) en el spec existente, cada test con `tms_only` y `observe(...)` | `tests/specs/controllers/mg1004-currency-contract.api.test.ts` | typecheck + lint; `ENV=test npx playwright test <spec> --grep "TM-1367\|TM-1424\|TM-1426" --workers=1 --retries=0` (solo lectura, sin `ALLOW_MUTATIONS`) | 0,4 d |
| **T4** | Spec de mutación: create de TM-1367 y TM-1424 (null, 9) con `afterEach` + `cancelTravel`; oráculo DB (baseline, STATE 9 sin chofer) | `tests/specs/_mutation/mg1004-create-currency-resolution.mutation.api.test.ts` | typecheck + lint; corrida dirigida con `ALLOW_MUTATIONS=1`; SELECT de que los 3 viajes quedaron en STATE 7 | 0,4 d |
| **T5** | Spec de mutación: TM-1395/1431 (filas A y B, multi-key), `COUNT(CONTRACTOR_CARRIERRATES)` antes/después | `tests/specs/_mutation/mg1004-contractor-rate-resolution.mutation.api.test.ts` | idem T4; 2 viajes cancelados | 0,4 d |
| **T6** | `ContractorAccountApi` (Discover del contractor y `setCheckingAccountLimit`, sin `@atc`), fixture y spec de TM-1394 con restauración verificada | `tests/components/api/ContractorAccountApi.ts`, `tests/fixtures/apiFixture.ts`, `tests/specs/_mutation/mg1004-checking-account-limit.mutation.api.test.ts` | typecheck + lint; corrida dirigida **fuera de :40-:50**; SELECT final: límite y `EXCEEDINGLIMIT` = originales | 0,6 d |
| **T7** | Oráculo DB de TM-1416 (M0 + M1) y su spec; snapshot gitignored | `tests/components/db/travelHistoryOracle.ts`, `tests/specs/controllers/mg1537-gmt-travel-history.api.test.ts` (+ `.gitignore` solo si `evidence/test/` no está ya cubierto) | `OracleDb.unit.ts` no se toca; agregar test unit del comparador puro si se aísla (tsx --test); M0 corre hoy; M1 en dos momentos | 0,4 d |
| **T8** | Gate de calidad: caso nuevo en `xray-consolidate.unit.ts` (dos `tms_only` en un test → ambas keys), `pnpm test:unit:reporters`, typecheck, `pnpm lint`, `pnpm format:check`, `playwright test --list` (cuenta de tests y keys), corrida completa de los 13 contratos con `XRAY=1` y revisión del JSON | `tests/utils/reporters/xray-consolidate.unit.ts` | Todos verdes; `reports/xray-results.json` con las 7 keys nuevas + 6 previas y sin keys ajenas (TM-945 etc.) | 0,3 d |
| **T9** | Paquete de evidencia por Test (`RESULTADO.md`, `DB.md`, `red-*.json`, tarjeta `*-api-card.png`) y publicación en Xray/Jira: la hace el **orquestador en el hilo principal** (escrituras irreversibles), tras el OK | fuera del repo (carpeta de evidencia de la épica) | Auditoría de consistencia previa al GO (comentario ↔ run ↔ evidencia) | 0,25 d |
| | **Total** | | | **3,75 d** |

Ola sugerida dentro de PK-A: T0 → T1 → T2 → T3 (TM-1426, TM-1424 y TM-1367 solo lectura son los quick wins del ROI) → T4 → T5 → T6 → T7 → T8 → T9. T7 (M1) necesita dos momentos de ejecución: planificar la fase 1 antes de las 22:00 ART de un día con viajes finalizados.

## 9. Riesgos y preguntas abiertas (solo reales)

**Riesgos**
- **R-1 (TM-1394, dato compartido)**: un fallo a mitad de la mutación deja el límite/«Permite exceder» alterados en una CC. Mitigación: sujeto propio de QA, `finally` + verificación por SELECT, valores originales guardados en annotation.
- **R-2 (importes)**: todo el oráculo de importes depende de que los tarifadores 6203/6204 no se editen (42,65). Cualquier cambio de tarifa por otro QA o por Dev rompe 5 tests a la vez. Mitigación: baseline leído en vivo de viajes de referencia; el mensaje de fallo indica «tarifa modificada» si `simulateAll` ≠ baseline pero `simulate` = `simulateAll`.
- **R-3 (relación con MG-1581 / TM-1111)**: si se corrige MG-1581 cambia el contrato de la CC; TM-1394 y el encabezado de CC (PK-F) se revisan juntos.
- **R-4 (cobertura parcial declarada)**: TM-1367 y TM-1424 cubren solo la partición de contrato del Gherkin (filas UI/PAX y D4/6203 quedan manuales o diferidas). Un run PASSED automático no equivale a cobertura total; se aclara en `xray_comment`.
- **R-5 (TM-1416 M0)**: el modo estático no detecta regresiones del job; el valor real está en M1.
- **R-6 (OpenAPI)**: `currency`, `carrierRateByCost`, `pricePointToPointCost` no están en `openapi.yaml`/`tests/generated`; se tipan localmente. No es defecto de PK-A, pero se anota.
- **R-7 (rama apilada)**: `contrato-api-f2` está apilada sobre TM-1158 y `tm1361-remediation`, sin merge a `origin/main` (R13 del ROI). PK-A no cambia eso; el orden de merge es el sugerido allí.

**Preguntas abiertas (genuinas)**
- **P1 (usuario / QA lead)** — ATR: ¿ATR nuevo bajo TM-1283 con las 13 keys (§7) o procedimiento del 20/10 (comentario + evidencia, sin importar)?
- **P2 (Dev-BE / QA)** — TM-1416: ¿el último «Then» (ítems de `TRAVEL_OTHERCOST_HISTORY` vs `TRAVEL_OTHERCOST`) es verificable? Para los tres viajes de referencia no hay ítems con ese `PRICEADDITIONAL_ID`. ¿Se acepta M1 (foto previa de `PRICEADDITIONAL`) como oráculo real?
- **P3 (Dev-BE)** — TM-1394: ¿sigue vigente el job de saldo en :40-:50 y se puede evitar con espera por condición, o conviene un límite fijo de horas para correr?
- **P4 (Dev-BE)** — `create` no revalida el límite (observado 15/10, viaje 71315): ¿es intencional? Hasta que se defina, no se asierta ni a favor ni en contra.
- **P5 (QA lead)** — ¿TM-1395/TM-1431 (tarifador 6203, de costo) entran en PK-A o pasan a F7 por la regla «costo no habilitado en PROD»? El plan los incluye porque asierta resolución de tarifa, no costo.

## 10. Criterio de cobertura, fuera de alcance y ejecución

- **Cubre**: contrato de API de alta/cotización con una moneda (omitida, null, explícita), paridad simulate/simulateAll, resolución del tarifador del empleado, `checkExceedingLimit` por saldo, y la copia al histórico por el cierre GMT, siempre sobre carrier 1521 en TEST con datos propios de QA.
- **Fuera**: costo y bimonetario (6203 default de D4, 6202), filas de app Pasajero, ARS de TM-1394, validaciones de UI, `quotes/*`, y el segundo punto de copia `INSERT_TRAVEL_HISTORY_NOPROCESSED` (el propio Gherkin lo excluye).
- **Comandos** (tras aprobar y codificar; ejemplo, no ejecutado): 
  `ENV=test XRAY=1 XRAY_RESULTS_FILE=evidence/test/xray-results.pka.json ALLOW_MUTATIONS=1 npx playwright test tests/specs/controllers/mg1004-currency-contract.api.test.ts tests/specs/_mutation/mg1004-*.mutation.api.test.ts tests/specs/controllers/mg1537-gmt-travel-history.api.test.ts --workers=1 --retries=0`
  (agregar `XRAY_EXECUTION_KEY=<ATR>` solo si se aprueba §7-A y recién antes del import; nunca `--reporter=` por CLI).
- **Mapeo manual ↔ automático**: TM-1367/1424/1426/1395/1431/1394 conservan sus runs manuales (ATR TM-1286/1288) y TM-1416 el suyo (TM-1292); la automatización los respalda como contrato sin reemplazar el veredicto manual.
