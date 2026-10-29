# Harness de mutación segura — diseño

Objetivo: habilitar de forma controlada los **~265 tests mutating** (POST/PUT/DELETE) hoy en
`test.fixme` (ver `docs/reference/fixme-triage.md`), sin dejar basura en el ambiente ni pegar a PROD.

## Principios

1. **Ciclo `create → verify → cleanup`.** Todo test mutating crea su propio dato, valida el
   contrato sobre él, y lo elimina en un `finally` (cleanup garantizado aunque falle el assert).
2. **Guard por env + luz verde.** Los specs de mutación viven en `tests/specs/_mutation/` y se
   saltan salvo `ALLOW_MUTATIONS=1`. Correrlos requiere luz verde explícita del QA Lead y apuntar
   a **UAT** (nunca PROD — el harness se auto-bloquea en prod; regla `docs/SCOPE.md`).
3. **Datos aislados y marcados.** Nombres con prefijo `QA-HARNESS-` + timestamp para trazabilidad
   y limpieza manual si un cleanup fallara.
4. **Body desde el contrato.** El cuerpo mínimo se deriva del DTO real: schema en `openapi.yaml`
   (`components.schemas`), nombre del DTO por endpoint en `scripts/backend-dtos.json`.
5. **Idempotencia de cleanup.** El `finally` tolera que el recurso ya no exista (no falla si el
   DELETE responde 404).

## Estructura

```
tests/specs/_mutation/
  <controller>.mutation.test.ts   ← 1 por controller, describe.serial, guarded por ALLOW_MUTATIONS
```

Ejecución local (opt-in): `ALLOW_MUTATIONS=1 npm run test:uat -- tests/specs/_mutation`
(requiere `.env.uat` con credenciales + luz verde). Sin la env var, todos se saltan.

## Patrón de referencia (piloto)

`tests/specs/_mutation/carrier-zone.mutation.api.test.ts` — CarrierZoneController, ciclo seguro:

| Paso    | Verbo  | Ruta                                                     | Nota                                                                   |
| ------- | ------ | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| create  | POST   | `carriers/{carrierId}/carrierZone`                       | body `CarrierZoneRequestDTO` mínimo; devuelve `{idZone, idForCarrier}` |
| verify  | GET    | `carriers/{carrierId}/carrierZone/{zoneId}`              | valida shape/nombre del recurso creado                                 |
| cleanup | DELETE | `carriers/{carrierId}/carrierZone/delete/{idForCarrier}` | en `finally`, idempotente                                              |

CarrierZone se eligió como piloto por tener un ciclo CRUD cerrado y de bajo riesgo (no toca
pagos, viajes ni liquidaciones).

## Rollout por criticidad (orden sugerido)

1. Bajo riesgo CRUD (piloto): CarrierZone, CarrierArea, ContractorArea, OtherCost, ServiceTypes.
2. Config/tarifas: CarrierRate, ConceptTax, Parameters.
3. Alto riesgo (requieren datos y coordinación): Travel (create/cancel), liquidaciones, pagos.
   Estos NO se automatizan sin datos de test dedicados + validación de rollback con el equipo BE.

## Criterio de done por controller

- create/verify/cleanup verde con `ALLOW_MUTATIONS=1` contra **UAT**.
- Cleanup deja el ambiente sin residuos (verificado con un GET post-cleanup).
- El `fixme` correspondiente en el spec de controller se reemplaza por el test de mutación o se
  enlaza a este harness.
