# Scope — magiis-api-e2e

## Alcance

Este proyecto cubre **únicamente tests API** del backend Magiis (`magiis-be release/v1.72.1`).

### Permitido

- ✅ GET/POST/PUT/PATCH/DELETE a cualquier endpoint del backend Magiis a través del `MagiisApiClient`.
- ✅ Asserts sobre status code, latencia, headers, body shape (Page<T>, List<T>, scalars, objects).
- ✅ Workflows encadenados (`tests/specs/_flows/`) con variables que pasan entre tests vía `describe.serial`.
- ✅ Validación contractual: schemas, asserts sobre campos específicos del body.
- ✅ Tests negativos (4xx, 5xx) cuando documenten contratos de error.
- ✅ Tests por rol (`ROLE_CARRIER`, `ROLE_ADMIN`, etc.) configurados vía env var `LOGIN_ROLE`.

### Prohibido

- ❌ Tests UI (van en `magiis-carrier-v2-e2e` para portal carrier V2, o en `magiis-playwright` para gateway).
- ❌ Tests mobile (Appium).
- ❌ Tests de performance / carga sistemática (otra suite dedicada).
- ❌ Mocks HTTP — apuntamos al backend real (en **UAT** por default).
- ❌ Modificar el backend Magiis o sus credenciales desde acá.
- ❌ Fuzzing/mutación y carga rutinaria contra **PROD** — PROD es **solo lectura de bajo volumen**;
  la ejecución funcional real va en **UAT**. (Única excepción de carga en PROD: la prueba de punto de
  quiebre de DB descrita abajo.)

> **Regla de ambientes del proyecto (2026-07-15):** los ambientes de trabajo son **siempre UAT y PROD**.
> TEST queda **fuera**. UAT (`.env.uat`) es el ambiente **seguro de ejecución** (harness de mutación, k6,
> schemathesis, suite completa). PROD (`.env.prod`) es **read-only** de bajo volumen. `runtime.ts` conserva
> el tipo `'test'|'uat'|'prod'` por compatibilidad, pero operativamente no se usa TEST.

> **EXCEPCIÓN — Módulos de pago / pasarelas (canónico 2026-07-21):** los flujos que ejercen pasarelas de
> pago (Stripe/Authorize/eBizCharge/MercadoPago — p.ej. `mg-3-stripe-direct-charge.api.test.ts`) corren
> **SOLO en TEST**, con `ENV=test`. En **UAT las pasarelas usan tarjetas reales**: la actividad de pruebas
> es inusual y **los PSP bloquean la cuenta**. TEST usa tarjetas de prueba. Estos specs fijan `test.skip`
> si `ENV!=='test'`. **Prereq operativo:** falta crear `.env.test` en este repo (hoy solo hay
> `.env.uat/.env.prod`) → la validación API de pagos en TEST está **bloqueada** hasta tener creds/BASE_URL TEST.

> **Performance en PROD — propósito único (política 2026-07-15):** las pruebas de tipo performance en
> **producción** existen **exclusivamente** para **encontrar el punto de quiebre del motor de base de datos**
> (stress controlado hasta degradación/saturación de la DB), con el fin de **armar estrategias de mejora e
> implementarlas bajo mejora continua**. NO es testing funcional, ni de regresión, ni carga rutinaria en PROD.
> Requisitos: luz verde explícita + ventana coordinada (baja actividad), monitoreo de la DB en vivo, criterios
> de corte (abortar al primer signo de impacto a usuarios reales), y un informe con hallazgos → backlog de
> mejoras. El baseline funcional/carga sigue corriéndose en **UAT**.

## Inmutables

1. **No commitear `.env.*` con secrets reales** — usar `.env.example` como template, valores reales solo locales o en GitHub Secrets / GitLab Variables.
2. **No alterar credenciales del backend desde scripts** — los `.env` son inputs, no outputs.
3. **No hardcodear IDs ni endpoints** — usar `cfg.carrierId`, `cfg.driverId`, etc. via runtime config.
4. **Trazabilidad obligatoria** — cada test que cubra un endpoint debe referenciar su `TS-API-TC###` del Excel canónico cuando exista.
5. **No usar APIs externas (MercadoPago/Stripe/etc.) directamente desde estos tests** — esas integraciones se prueban a través del backend Magiis, no llamando al provider externo.

## Excepciones futuras (controladas)

- **OpenAPI/Schemathesis** se incorporará como subproyecto Python en `schemathesis/` (cuando se agende).
- **Tests de smoke contra DEV/STAGING** requerirán PR específico con label `cross-env-approved`.
- **Tests que requieran datos custom de test** se sirven desde `tests/data/` (gitignored si tienen PII).
