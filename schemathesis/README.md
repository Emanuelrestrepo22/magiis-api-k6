# Schemathesis — Contract fuzzing (magiis-api-e2e)

Subproyecto Python de **contract fuzzing** del backend Magiis con
[Schemathesis](https://schemathesis.readthedocs.io/). Genera casos automáticamente
desde `../openapi.yaml` (OpenAPI 3.0, 726 operaciones) y valida que cada respuesta
cumpla el contrato declarado en el spec: status codes, content-type y schema de
respuesta.

> **OPT-IN · LOCAL-ONLY · NO pegarle al backend sin luz verde del QA Lead.**
> Por `docs/SCOPE.md`, ejecutar requests sistemáticos requiere aprobación
> explícita. Estos tests **no** corren en CI ni por defecto. La COLECCIÓN de
> casos (`pytest --collect-only`) funciona sin credenciales ni red; la EJECUCIÓN
> real solo ocurre si hay `LOGIN_USER`/`LOGIN_PASSWORD` (sin ellos cada test hace
> `skip`). Default: apuntar a **TEST** (`apps-test.example.com`), nunca a UAT/DEV/PROD
> sin autorización.

## Por qué Python (y no npm)

Schemathesis es una herramienta Python; el suite E2E principal es Playwright +
TypeScript. Para no mezclar toolchains, este subproyecto vive aislado en
`schemathesis/` con su propio `venv` y `requirements.txt`. Reusa el **mismo
contrato de auth y las mismas env vars** que Playwright y k6.

## 1. Instalar (venv)

Desde `schemathesis/` (Python 3.13 en PATH):

```powershell
# Windows / PowerShell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

```bash
# macOS / Linux
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Versiones fijadas: `schemathesis==3.39.16`, `pytest==8.4.2`, `requests==2.34.2`,
`python-dotenv==1.2.2`. **No** subir a schemathesis 4.x sin re-adaptar
`test_contract.py` (la API de carga del schema cambió entre 3.x y 4.x).

## 2. Configurar env vars

Mismas variables que Playwright / k6 (ver `.env.example` en la raíz del repo).
Se leen del entorno; opcionalmente de un `.env` en `schemathesis/` o en la raíz
del repo (vía `python-dotenv`). Una variable exportada en la shell tiene prioridad
sobre el `.env`.

| Variable            | Default                         | Descripción                                     |
| ------------------- | ------------------------------- | ----------------------------------------------- |
| `BASE_URL`          | `https://apps-test.example.com` | Host del backend (TEST por default).            |
| `MAGIIS_API_PREFIX` | `magiis-v0.2`                   | Prefijo de la API (tolera barra final).         |
| `LOGIN_USER`        | (vacío)                         | Usuario de login. **Vacío → tests en `skip`.**  |
| `LOGIN_PASSWORD`    | (vacío)                         | Password de login. **Vacío → tests en `skip`.** |
| `LOGIN_ROLE`        | `ROLE_CARRIER`                  | Rol para el header `RoleToAttempt`.             |

Auth (idéntico a Playwright / k6):
`POST {BASE_URL}/{MAGIIS_API_PREFIX}/auth/login` con
`Content-Type: application/json` + `RoleToAttempt: {LOGIN_ROLE}` y body
`{"username", "password"}` → `{"token": "..."}`. Luego `Authorization: Bearer {token}`.

**NUNCA** commitear credenciales reales (los `.env*` están gitignored salvo
`.env.example`).

## 3. Colectar casos (sin backend — siempre seguro)

Valida que el spec carga y genera un caso por operación, **sin pegarle al backend**:

```powershell
pytest --collect-only -q
```

Debe listar ~726 tests parametrizados (`test_openapi_contract[METHOD /path]`).

## 4. Ejecutar contra el backend (OPT-IN — requiere green light)

> Solo con luz verde del QA Lead y apuntando a **TEST**.

```powershell
$env:LOGIN_USER = "..."; $env:LOGIN_PASSWORD = "..."   # o usar .env
pytest -q
```

- **Limitar a un subconjunto de endpoints** con `-k` (filtra por el id del caso):

  ```powershell
  pytest -k "carriers"                      # solo operaciones que matcheen "carriers"
  pytest -k "GET and drivers"               # combinación
  pytest "test_contract.py::test_openapi_contract[GET /magiis-v0.2/api/carriers]"
  ```

- **Apuntar a TEST** (default) o a otro host (requiere aprobación cross-env):

  ```powershell
  $env:BASE_URL = "https://apps-test.example.com"   # TEST (default)
  # UAT / DEV solo con label cross-env-approved (ver docs/SCOPE.md)
  ```

## 5. Reportes

Los reportes van a `reports/schemathesis/` en la raíz del repo (**gitignored**
vía `reports/`). Crear la carpeta y volcar el JUnit XML de pytest:

```powershell
mkdir -Force ..\reports\schemathesis | Out-Null
pytest --junit-xml=..\reports\schemathesis\junit.xml
```

## Alcance y límites

- Cubre las 726 operaciones del spec; la calidad de los datos generados depende
  de cuán completos estén los `schema`/`example` en `../openapi.yaml`.
- Los checks son los **default de Schemathesis** (conformidad status/content-type/
  response schema). No sustituye a los asserts funcionales del suite Playwright.
- Sin datos de fixtures reales, muchos POST/PUT/DELETE pueden devolver 4xx
  legítimos: interpretar los hallazgos con criterio antes de reportar bugs.
- No se prueban integraciones externas (Stripe / Mercado Pago) directamente:
  se ejercitan solo a través del backend Magiis.
