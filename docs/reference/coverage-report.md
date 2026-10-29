# Reporte de cobertura — magiis-api-e2e

Generado por `node scripts/coverage-report.mjs` (determinista, sin backend).

Cruza `openapi.yaml` (contrato desde el source) × specs de test × uso de los FE.

## Cobertura de tests vs contrato

- Operaciones del contrato: **802**
- Ejercidas por algún spec (match verbo+ruta): **255** (31.8%)

| Verbo  | Contrato | Con test | %     |
| ------ | -------- | -------- | ----- |
| GET    | 373      | 225      | 60.3% |
| POST   | 247      | 22       | 8.9%  |
| PUT    | 148      | 3        | 2.0%  |
| DELETE | 33       | 5        | 15.2% |
| PATCH  | 1        | 0        | 0.0%  |

> Nota: la cobertura de mutación (POST/PUT/DELETE) vive en `tests/specs/_mutation/` (guarded).
> La read-only (GET) en `tests/specs/controllers/`. Los tests tolerantes `[200,4xx]` cuentan como ejercidos.

## Cobertura vs uso real de la plataforma (FE)

- Endpoints usados por los FE carrier+driver (∩ contrato): **385**
- De esos, con test: **113** (29.4%)
- Usados por FE SIN test (gap prioritario): **272**

### Endpoints usados por FE sin cobertura (top 40)

- admins
- admins/adminType/permission
- admins/byUser/{}
- admins/carriers
- admins/dashboard
- admins/parameters/general/{}
- admins/permission/{}
- admins/permissions
- admins/permissions/paginated
- admins/reSendNotification/{}
- admins/{}
- affiCheckingAccount/{}/addLiquidation
- affiCheckingAccount/{}/addMovement
- affiCheckingAccount/{}/deleteLiquidation/{}
- affiOneShotTravel/createOSTravelAgreement
- affiOneShotTravel/getDistanceTimeForRouteAndProviders
- affiOneShotTravel/{}/acceptOSTravelAgreement
- affiOneShotTravel/{}/createTravelReserve
- affiOneShotTravel/{}/decline
- affiOneShotTravel/{}/quotingTravel
- affiOneShotTravel/{}/sendOSTravelAgreementInvitation
- affiOneShotTravel/{}/sendTravelReserveMailQuotization
- affiliateAgreement/sendAgreementInvitation
- affiliateAgreement/{}/acceptAffiAgreement
- affiliateAgreement/{}/declineAffiAgreement
- affiliateAgreement/{}/getWitnessTravels
- affiliateAgreement/{}/saveTransferData
- affiliateAgreement/{}/updateAgreementValidity
- affiliateProfile/{}/getOfferersPaginated
- api
- api/applications/blocked
- api/applications/{}
- api/applications/{}/{}
- api/applications/{}/{}/reset/{}
- api/roles
- api/user/validate/{}
- api/{}/{}
- billing/billing/file/{}
- billing/carriers/{}/generateReport
- billing/getLiquidationDetails/report/{}

## Método

- Contrato: paths×verbos de `openapi.yaml` (generado desde el source de magiis-be).
- Tested: llamadas `getJson/postJson/...` en `tests/specs/**`, normalizando `{param}`/`${..}`→`{}`.
- FE: `_commandUrl` de magiis-fe (prod) + carrier-v2 + driver-v2 (pax usa call-site, no incluido).
