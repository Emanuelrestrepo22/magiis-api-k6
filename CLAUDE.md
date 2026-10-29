# CLAUDE.md — magiis-api-e2e

Contrato para agentes AI en este repo. La **metodología** vive en el orquestador
`agentic-qa-boilerplate` (HUB KATA); aquí se **aplica** el contrato de consistencia
del portafolio QA MAGIIS. Identidad estructurada en `.agents/project.yaml`.

## Rol en el portafolio

Capa **API** del portafolio de automatización MAGIIS (Carrier). Valida el contrato del
backend `magiis-be` (Spring/Oracle) con Playwright `APIRequestContext` — **sin browser**.
Repos hermanos: `magiis-carrier-v2-e2e` (UI), `magiis-playwright` (gateway), `agentic-qa-boilerplate` (HUB).

## Contrato de consistencia (obligatorio)

1. **Trazabilidad**: cada test relevante mapea a un TC del TMS vía annotation
   `test.info().annotations.push({ type: 'tms', description: 'MG-XXXX' })` + `type: 'tc'`
   para subcasos. El binding `type:'tms'` lo consume el reporter (sync a **jira-native**,
   MG no tiene Xray; el xray-reporter queda para el histórico MX/AF).
   > Deprecar la convención `TS-API-TC###` no aplicada; usar keys **MG-XXXX**.
   > **Migración MX→MG (2026-07-17)**: keys nuevas = MG. Las MX-XXXX en specs son
   > históricas — mapear a su MG equivalente cuando la migración entregue el cruce.
2. **Ambientes**: vocabulario `uat`/`prod` (mapeo HUB: uat=staging, prod=production).
   TEST fuera de alcance (SCOPE.md). PROD **solo read-only**.
3. **Secretos**: NUNCA hardcodear keys. `.mcp.json` referencia `${POSTMAN_API_KEY}`
   desde el entorno / `.env` (gitignored). Ver `.env.example`.
4. **CI**: gate `lint → typecheck → format:check` (job `quality-checks`) antes de tests (`api-test` con `needs`). Ref `.github/workflows/api-tests.yml`.
5. **Commits**: convención `<tipo>(<scope>): [MG-XXXX] descripción` cuando aplique a un TC.
6. **Higiene**: sin duplicados OneDrive `(1)`, sin logs sueltos versionados.

## Convenciones del repo (respetarlas)

- **Runtime**: pnpm + Node ≥22, ESM. NO migrar a Bun.
- **Arquitectura actual**: cliente genérico `MagiisApiClient` + specs planos en
  `tests/specs/{controllers,_mutation,_flows}`. Asserts contractuales en `tests/helpers/`.
- **Eje de agrupación de specs — variante declarada, no deuda**: este repo agrupa
  primero por **riesgo operativo** (`controllers/` 69 archivos solo lectura, `_mutation/`
  12 con doble guarda, `_flows/` 11 encadenados), y el dominio de negocio queda como
  sub-nivel dentro de cada carpeta (nombre de archivo). El canon del portafolio agrupa
  por dominio de negocio sin nivel intermedio; en una suite de API pura el riesgo de
  disparar una mutación contra producción por accidente pesa más que el dominio, y ese
  riesgo debe ser visible en la ruta del archivo antes de abrirlo — el dominio no se
  pierde porque ya está en el nombre de cada spec. Ver el detalle del layout en
  `docs/ARCHITECTURE.md` ("Crecer el suite"). Variante **homologada por
  `agentic-qa-boilerplate/.context/ADR/ADR-0002-organizacion-de-tests-y-variantes-por-repo.md`**
  (tabla de variantes, fila `magiis-api-e2e`). Por la regla de convivencia del ADR: es
  una decisión vigente, no se corrige de oficio — quien quiera cambiarla primero lo
  conversa con el equipo de este repo.
- **KATA incremental (Nivel 2, opt-in)**: introducir `ApiBase` + `*Api` por dominio con
  `@atc('MG-NNN')` como **piloto** (ej. `CarrierRateApi`); no big-bang. El resto sigue en cliente genérico hasta validar el patrón.
- **Datos**: IDs derivados en runtime (nunca hardcodear); mutaciones bajo doble guard
  (`ALLOW_MUTATIONS=1` + `test.skip(IS_PROD)`), cleanup en `finally`.
- **OpenAPI source-first**: `catalog:from-be → generate:openapi → generate:types`
  (ground truth = código Java, no snapshot Postman).
- **Aliases**: migrar imports relativos (`../../`) a aliases de `tsconfig`.

## Comandos clave

```bash
pnpm test                 # suite completa (ENV por defecto)
pnpm test:uat             # ejecución en UAT
ENV=uat pnpm test:controllers   # solo controllers (read-only)
./node_modules/.bin/tsc --noEmit  # typecheck (evita el pre-install de pnpm)
pnpm lint                 # eslint --max-warnings=0
pnpm generate:openapi     # regenerar contrato desde magiis-be
```

## Reglas de oro (heredadas del HUB, KATA)

- Setup vía API, verificación vía API; tests independientes; data única (faker).
- Sin `waitForTimeout`; esperas por condición observable.
- Un ATC = caso de prueba completo (acción + verificación), no un GET suelto.
- Máx 2 parámetros posicionales; 3+ → objeto.

## Postman API key

La `POSTMAN_API_KEY` es **válida y NO se rota** (decisión del equipo). Se mantiene fuera
del archivo: `.mcp.json` la referencia como `${POSTMAN_API_KEY}` y se provee por entorno.
Nunca entró al historial git (`.mcp.json` está gitignored).

Para que el Postman MCP resuelva la key, exportarla antes de arrancar el cliente:

```bash
export POSTMAN_API_KEY="PMAK-..."   # la key válida (no commitear)
```

O cargarla desde un `.env` gitignored si tu flujo lo sourcea antes de lanzar el MCP.
