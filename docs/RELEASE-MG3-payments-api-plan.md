# Plan de capa API — Release MG-3 (Stripe 3DS / cobro directo)

> **Ambiente: TEST.** Estas pruebas de pago corren en **TEST** (tarjetas de prueba). **UAT usa tarjetas reales** → prohibido correr pagos en UAT/PROD.
> Correr con `cross-env ENV=test pnpm test:flows`.

| Campo           | Valor                                                                                               |
| --------------- | --------------------------------------------------------------------------------------------------- |
| Backend         | **MG-3** `[Stripe][BE]` cobro directo + webhook async + 3DS/SCA                                     |
| Consumidores FE | MG-20 (Carrier), MG-25 (unlink), MG-26 (Driver), MG-27 (Pax)                                        |
| Proyecto        | `magiis-api-e2e` (capa **API** del portafolio; UI en `magiis-carrier-v2-e2e` / `magiis-playwright`) |
| Spec existente  | `tests/specs/_flows/mg-3-stripe-direct-charge.api.test.ts`                                          |
| Trazabilidad    | keys `MG-XXXX` (jira-native); `TS-API-TC###` deprecado                                              |

## 1. Cobertura actual (validado)

| Endpoint                                             | Ticket FE    | TC                    | Estado                                   |
| ---------------------------------------------------- | ------------ | --------------------- | ---------------------------------------- |
| `GET vendor/carrier/{carrierId}/connectedAccount`    | MG-26, MG-25 | `TC-MG3-CONNACCT`     | 🟢 activo                                |
| `allCards` (regresión "sin wallet ⇒ 200, nunca 500") | —            | `TC-MG3-REG-ALLCARDS` | 🟢 activo                                |
| `cardValidationWith3DS`                              | MG-20, MG-27 | `TC-MG3-3DSVAL`       | 🟡 `test.fixme`                          |
| `confirm3DSVerification`                             | MG-20, MG-27 | `TC-MG3-3DSCONFIRM`   | 🟡 `test.fixme`                          |
| `confirmHoldWith3DS` (Hold)                          | MG-20        | `TC-MG3-HOLD3DS`      | 🟡 `test.fixme`                          |
| `ePayment` / `finalize`                              | MG-26        | `TC-MG3-18`           | 🟡 `test.fixme`                          |
| `POST passengers/{passengerId}/cardToken`            | MG-20, MG-27 | —                     | 🔴 sin test                              |
| `cleaningWallets`                                    | MG-25        | —                     | 🔴 sin test (ni en contrato ni catálogo) |
| `cardValidationWithHold`                             | MG-20        | —                     | 🔴 sin test (existe en `openapi.yaml`)   |

## 2. Bloqueante raíz (prerrequisito de todo lo demás)

El `openapi.yaml` y `scripts/backend-route-catalog.json` son de `release/v1.72.1` y **predatan MG-3** → las rutas/bodies de los endpoints nuevos no son confirmables desde el repo. Por eso los TCs están en `test.fixme`.

**Antes de sacar los `fixme`:**

1. Deploy de MG-3 en **TEST**.
2. Regenerar contrato source-first: `pnpm generate:openapi` + `pnpm catalog:from-be` (+ `pnpm generate:types`).
3. Fixture Stripe 3DS + datos sembrados en TEST (pasajero con tarjeta, `carrierId`).

## 3. Patrón canónico para agregar cobertura

Igual que `mg-3-stripe-direct-charge.api.test.ts`:

- Spec en `tests/specs/_flows/`; requests vía `magiisApi.postJson/getJson` (`tests/clients/magiis-api-client.ts`).
- Anotar con `makeAnnotate('MG-3')` (`tests/helpers/traceability.ts`) → `type:'tms'` + `type:'tc'`. Cross-linkear el ticket FE en el título/nota del TC.
- IDs derivados en runtime; asserts **tolerantes que excluyen 5xx**.
- Mutaciones bajo doble guarda: `ALLOW_MUTATIONS=1` + `test.skip(IS_PROD)`. **Correr solo contra TEST.**
- **Opcional (KATA Nivel 2):** `PaymentApi extends ApiBase` en `tests/components/api/` + fixture DI, espejando `CarrierRateApi` (ATC = acción + fixed assertion + `return` encadenable).

## 4. Estándar trifuerza en la capa API

- Hoy la validación es **request → response contractual** vs `openapi.yaml` (ground truth = código Java de `magiis-be`, source-first).
- **Pata DB (Oracle) NO implementada** (`.agents/project.yaml` → `db_mcp: null`, TODO). Sin validación cruzada request→response→DB automatizada.
- **Backlog:** habilitar Oracle read-only (SQLcl MCP / DBHub) para verificar persistencia (tarjeta tokenizada, `paymentReference`, wallets borradas por `cleaningWallets`). Complementa la pata DB ya existente en `magiis-playwright` (`tests/components/db/OracleDb.ts`).

## 5. Trabajo planificado (backlog API)

1. **Regenerar contrato** post-deploy MG-3 en TEST. _(prereq)_
2. **Sacar de `fixme` y completar:** `cardValidationWith3DS`, `confirm3DSVerification`, `confirmHoldWith3DS`, `ePayment`/`finalize`.
3. **Crear desde cero:** `cardToken`, `cleaningWallets`, `cardValidationWithHold`.
4. **Regresión a mantener verde:** `connectedAccount`, `allCards`.
5. **Opcional:** componente `PaymentApi` (KATA L2) + fixture DI.
6. **Pata DB Oracle** (MCP read-only) → validación request→response→DB.

**Fuera de alcance (otro track):** `vendor.api.test.ts` declara `authorize/mercadopago/square/ebiz` fuera de alcance → la regresión API cross-gateway es limitada; la regresión cross-gateway real se hace por UI en `magiis-playwright` (BL-037 switching).

## 6. Comandos (TEST)

```bash
cross-env ENV=test pnpm test:flows          # corre _flows (incluye MG-3)
cross-env ENV=test ALLOW_MUTATIONS=1 pnpm test:flows   # habilita bloque mutante (solo TEST)
pnpm generate:openapi && pnpm catalog:from-be && pnpm generate:types  # regenerar contrato post-MG-3
pnpm coverage                                # reporte de cobertura de endpoints
```

## 7. Verificación (baseline actual)

`cross-env ENV=test pnpm test:flows` → `TC-MG3-CONNACCT` y `TC-MG3-REG-ALLCARDS` en verde; el resto sigue en `fixme` (esperado hasta regenerar el contrato).

## 8. Exploratorio TEST — 2026-07-23 (Hold & cobro MG-512 + MP API)

Specs nuevos (probes exploratorios, no `fixme`): `tests/specs/_flows/mg-512-hold-cobro-explore.api.test.ts` y `mp-api-explore.api.test.ts`. Enfoque: enviar el request en TEST con **body vacío** (no cobra) y registrar el **status real** (`console [EXPLORE]`), aserción tolerante. Corrida `ENV=test ALLOW_MUTATIONS=1` → **8/8 passed**. Status observados:

| Endpoint                                                   | Método | Status TEST          | Hallazgo                                                                                                                                                                          |
| ---------------------------------------------------------- | ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vendor/carrier/{id}/connectedAccount`                     | GET    | **200**              | Cuenta conectada del carrier OK (pre-cobro directo).                                                                                                                              |
| `passengers/{pax}/allCards`                                | GET    | **200**              | Wallet del pax OK (sin 500 → regresión MG-3 no reproduce).                                                                                                                        |
| `cards/{carrierId}/cardTypes`                              | GET    | **200**              | Tipos de tarjeta OK.                                                                                                                                                              |
| `carriers/{id}/travels/{travelId}/confirmHoldWith3DS`      | POST   | **400** (travelId=0) | ✅ **Endpoint DESPLEGADO y valida** entrada. Automatizable con `{travelId}` apto + body 3DS confirmado → sacar de `fixme` (área E · MG-158).                                      |
| `cards/passengers/{pax}/cardValidationWith3DS/{carrierId}` | POST   | **404**              | Ruta no encontrada en TEST — el path del repo (predata MG-3) difiere o no está desplegada. Confirmar ruta real con dev/OpenAPI regen.                                             |
| `epayment`                                                 | POST   | **404**              | Ruta pelada incorrecta/no desplegada. Confirmar path real del finalize (área F · MG-161).                                                                                         |
| `carriers/{id}/paymentMethodsByPax`                        | POST   | **500** ⚠️           | Responde **500** con body `{passengerId}`. Body incorrecto (NPE por shape) **o bug backend** — investigar (candidato a defecto). Gap total previo: no estaba cubierto en el repo. |

**Conclusiones accionables:**

- **Desbloqueable ya:** `confirmHoldWith3DS` (existe + valida). Con un `travelId` en estado apto + body 3DS confirmado, pasar el probe a aserción firme (REQUIRES_ACTION→NO_AUTH / 3DS OK→HOLD).
- **Confirmar rutas con dev:** `cardValidationWith3DS` y `epayment` dan 404 → el contrato del repo (v1.72.1) no refleja las rutas MG-3; regenerar (`pnpm generate:openapi && catalog:from-be && generate:types`).
- **Investigar 500:** `paymentMethodsByPax` → reproducir con distintos shapes de body; si el 500 persiste con body válido = defecto backend a reportar.
- **MP:** read layer (connectedAccount/cardTypes) OK; cobro E2E MP no transacciona en TEST (validado por UI) → verificación end-to-end MP es UAT-only.
