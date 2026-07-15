# k6 — Performance testing (magiis-api-e2e)

Subproyecto de pruebas de performance del backend Magiis con [k6](https://k6.io/).
Cubre tres perfiles de carga sobre endpoints **read-only**: smoke, load y stress.

> **OPT-IN — no correr por defecto.** La carga sistemática está **prohibida** por
> `docs/SCOPE.md` sin luz verde explícita del QA Lead. Estos scripts NO se
> ejecutan en CI ni en local salvo aprobación. Default: apuntar a **TEST**
> (`apps-test.example.com`), nunca a UAT/PROD sin autorización.

## Por qué k6 (y no npm)

k6 corre como **binario externo standalone** escrito en Go. Los scripts son
JavaScript ESM que interpreta el propio k6, **no Node**: usan `import http from 'k6/http'`,
`import { check, sleep } from 'k6'` y leen configuración con `__ENV`. Por eso k6
**no** se instala como dependencia npm ni aparece en `package.json` como paquete.

## 1. Instalar k6

Ver guía oficial: https://grafana.com/docs/k6/latest/set-up/install-k6/

- **Windows** (winget): `winget install k6 --source winget`
- **Windows** (choco): `choco install k6`
- **macOS** (brew): `brew install k6`
- **Linux** (Debian/Ubuntu): ver repo APT en la guía oficial.

Verificar instalación: `k6 version`

## 2. Configurar env vars

Los scripts leen las **mismas** variables que el suite Playwright (ver `.env.example`
en la raíz). k6 NO lee archivos `.env` automáticamente: pasar las vars por entorno
o con `-e`.

| Variable                 | Default                         | Descripción                        |
| ------------------------ | ------------------------------- | ---------------------------------- |
| `BASE_URL`               | `https://apps-test.example.com` | Host del backend                   |
| `MAGIIS_API_PREFIX`      | `magiis-v0.2`                   | Prefijo de la API                  |
| `LOGIN_USER`             | (vacío — requerido)             | Usuario de login                   |
| `LOGIN_PASSWORD`         | (vacío — requerido)             | Password de login                  |
| `LOGIN_ROLE`             | `ROLE_CARRIER`                  | Rol para el header `RoleToAttempt` |
| `MAGIIS_TEST_CARRIER_ID` | `1040`                          | ID de carrier de prueba            |
| `MAGIIS_TEST_DRIVER_ID`  | `1203`                          | ID de driver de prueba             |

**NUNCA** commitear credenciales reales. Usar variables de entorno locales o
GitHub Secrets / GitLab Variables (ver `docs/SCOPE.md`).

### Setear vars — PowerShell (Windows)

```powershell
$env:LOGIN_USER = "<tu-usuario>"
$env:LOGIN_PASSWORD = "<tu-password>"
k6 run k6/smoke.js
```

### Setear vars — bash / con flags `-e`

```bash
k6 run -e LOGIN_USER=<tu-usuario> -e LOGIN_PASSWORD=<tu-password> k6/smoke.js
```

## 3. Comandos de ejecución

Desde la raíz del repo (también disponibles como scripts npm):

| Perfil | Comando directo       | Script npm          | Carga                               |
| ------ | --------------------- | ------------------- | ----------------------------------- |
| Smoke  | `k6 run k6/smoke.js`  | `npm run k6:smoke`  | 1 VU, 1 iteración (chequeo de humo) |
| Load   | `k6 run k6/load.js`   | `npm run k6:load`   | 0→10 VUs, sostiene 1m, baja a 0     |
| Stress | `k6 run k6/stress.js` | `npm run k6:stress` | rampa agresiva hasta 50 VUs         |

Los scripts npm son atajos; requieren igualmente el binario `k6` en el PATH.

## 4. Thresholds

Todos los scripts comparten los mismos umbrales de aceptación:

- `http_req_duration: ['p(95)<800']` — p95 de latencia bajo 800 ms.
- `http_req_failed: ['rate<0.01']` — menos de 1% de requests fallidos.

En `smoke.js` y `load.js` los thresholds son criterio de **éxito**. En `stress.js`
son intencionalmente el criterio de **quiebre**: superarlos bajo estrés es el
hallazgo que buscamos (dónde se degrada el backend).

## 5. Reportes

Los reportes van a `reports/k6/` (la carpeta `reports/` ya está en `.gitignore`).
k6 imprime el resumen en consola por default. Para exportar:

```bash
# Resumen JSON al finalizar
k6 run --summary-export=reports/k6/smoke-summary.json k6/smoke.js

# Métricas crudas por punto de tiempo
k6 run --out json=reports/k6/load-metrics.json k6/load.js
```

Crear la carpeta antes si no existe: `mkdir -p reports/k6`.

## Estructura

```text
k6/
├── lib/
│   ├── config.js   # env vars con defaults + buildUrl(path)
│   └── auth.js     # login() -> token + authHeaders(token)
├── smoke.js        # 1 VU, 1 iteración
├── load.js         # rampa sostenida hasta 10 VUs
├── stress.js       # rampa agresiva hasta 50 VUs
└── README.md
```
