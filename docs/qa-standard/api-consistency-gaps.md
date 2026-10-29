# magiis-api-e2e — Backlog de gaps de consistencia (bloqueados por dato/decisión externa)

> Estado base (2026-07-23): el repo pasa el validador del HUB **6/6** (`bun scripts/consistency-check.ts`).
> Nivel 1 (gobernanza/identidad/higiene/CI/aliases) verde; KATA piloto activo (`ApiBase` + `CarrierRateApi` + `PaymentApi` + `@atc`).
> Estos gaps NO se cierran a ciegas — requieren dato o decisión externa. **No se fabrican keys.**

| #   | Gap                                                                             | Impacto                                                                              | Acción requerida                                                                                                                                        | Responsable / dato        |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| 1   | **Trazabilidad de ~65 controllers sin key MG** (78/86 specs sin `type:'tms'`)   | Cobertura de trazabilidad baja pese a validador verde                                | Entregar/validar la **matriz de Test MG por endpoint** (MAGIIS-4) → anotar cada controller con `makeAnnotate('MG-XXXX')` o ATC `@atc`                   | QA Lead / MAGIIS-4 (Jira) |
| 2   | **Mapeo histórico MX→MG**                                                       | Keys `MX-58xx/60xx/61xx` legacy en specs sin equivalente MG                          | Cruce de migración MX (MAGIIS-3.0) → MG (MAGIIS-4); reemplazar keys en specs                                                                            | Migración MX→MG           |
| 3   | **Pata DB Oracle** (`.agents/project.yaml` `db_mcp:null`)                       | Sin validación request→response→**DB** (persistencia token/paymentReference/wallets) | Decidir **SQLcl MCP vs DBHub thick** + provisionar **cuenta Oracle read-only** (uat/prod)                                                               | Infra / QA Lead           |
| 4   | **Reasignar `@atc('MG-3')` de `CarrierRateApi`**                                | Ancla-fallback; no es la key real del dominio CarrierRate                            | Cuando CarrierRate entre a la matriz QA, reasignar a su key MG por endpoint                                                                             | QA Lead / MAGIIS-4        |
| 5   | **Rutas MG-3 sin confirmar** (`cardValidationWith3DS`/`epayment` → 404 en TEST) | Probes exploratorios devuelven 404 (contrato v1.72.1 predata MG-3)                   | Deploy MG-3 en TEST + regen contrato (`generate:openapi && catalog:from-be && generate:types`) → confirmar rutas/bodies y sacar probes a aserción firme | Backend MG-3 / QA         |
| 6   | **`paymentMethodsByPax` → 500** (probe MP, MPX-02)                              | Posible defecto backend o body incorrecto                                            | Reproducir con body válido; si 500 persiste = **defecto a reportar** (Jira)                                                                             | QA + Backend              |

## Ejecutable ya (no bloqueado) — estado

- ✅ Payment flows subidos a KATA (`PaymentApi` L3 + fixture `paymentApi` DI; `mg-3` activos, `mg-512`, `mp-api` migrados).
- ✅ `admin-user.api.test.ts`: removido el prefijo deprecado `TS-API`.
- ✅ `CLAUDE.md`: gate documentado alineado al workflow real (`format:check`).

## Referencias

- Contrato de consistencia (HUB): `agentic-qa-boilerplate/docs/qa-standard/portfolio-consistency.md`.
- Validador: `agentic-qa-boilerplate/scripts/consistency-check.ts`.
- Plan de pagos API: `docs/RELEASE-MG3-payments-api-plan.md` (§8 hallazgos exploratorios).
