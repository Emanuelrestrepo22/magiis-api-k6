"""Fixtures pytest para el suite de contract fuzzing (Schemathesis).

Política del proyecto (docs/SCOPE.md):
- Ejecución LOCAL-ONLY y OPT-IN.
- NO se le pega al backend sin luz verde explícita del QA Lead.
- La COLECCIÓN de tests (pytest --collect-only) funciona SIN credenciales ni
  requests HTTP; la EJECUCIÓN real requiere LOGIN_USER/LOGIN_PASSWORD.

Contrato de auth (idéntico al suite Playwright / k6):
  POST {BASE_URL}/{MAGIIS_API_PREFIX}/auth/login
  headers: Content-Type: application/json, RoleToAttempt: {LOGIN_ROLE}
  body: {"username": ..., "password": ...}
  respuesta 200: {"token": "..."}
Luego: Authorization: Bearer {token}.
"""

import os
from pathlib import Path

import pytest
import requests

# Raíz del repo = carpeta padre de schemathesis/
_REPO_ROOT = Path(__file__).resolve().parent.parent
_SCHEMATHESIS_DIR = Path(__file__).resolve().parent

# Defaults conocidos en TEST (ver .env.example en la raíz del repo).
_DEFAULT_BASE_URL = "https://apps-test.example.com"
_DEFAULT_API_PREFIX = "magiis-v0.2"
_DEFAULT_LOGIN_ROLE = "ROLE_CARRIER"

_LOGIN_TIMEOUT_SECONDS = 30


def _load_env() -> None:
    """Carga .env desde schemathesis/ y desde la raíz del repo, si existen.

    python-dotenv por defecto NO pisa variables ya presentes en el entorno,
    así que un env var real exportado en la shell tiene prioridad.
    """
    try:
        from dotenv import load_dotenv
    except ImportError:
        return
    # Raíz primero; schemathesis/.env luego (override local sobre la raíz).
    load_dotenv(_REPO_ROOT / ".env")
    load_dotenv(_SCHEMATHESIS_DIR / ".env", override=True)


def build_base_url() -> str:
    """Deriva la base URL de la API: BASE_URL + MAGIIS_API_PREFIX, normalizada.

    Tolera el prefijo con o sin barras (`.env.example` lo trae como
    `magiis-v0.2/`; k6 lo documenta como `magiis-v0.2`).
    """
    base = os.getenv("BASE_URL", _DEFAULT_BASE_URL).rstrip("/")
    prefix = os.getenv("MAGIIS_API_PREFIX", _DEFAULT_API_PREFIX).strip("/")
    return f"{base}/{prefix}" if prefix else base


# Cargar env lo antes posible (también lo necesita test_contract.py al importar).
_load_env()


@pytest.fixture(scope="session")
def base_url() -> str:
    """Base URL de la API bajo prueba (BASE_URL + prefijo)."""
    return build_base_url()


@pytest.fixture(scope="session")
def auth_token() -> str | None:
    """Token JWT vía login. None si faltan credenciales (los tests se skipean).

    Si HAY credenciales pero el login falla, se aborta con pytest.fail para no
    correr todo el suite contra un backend inaccesible o mal configurado.
    """
    user = os.getenv("LOGIN_USER")
    password = os.getenv("LOGIN_PASSWORD")
    if not user or not password:
        # Sin creds: modo colección / diseño. Los tests hacen skip.
        return None

    role = os.getenv("LOGIN_ROLE", _DEFAULT_LOGIN_ROLE)
    login_url = f"{build_base_url()}/auth/login"

    try:
        resp = requests.post(
            login_url,
            json={"username": user, "password": password},
            headers={
                "Content-Type": "application/json",
                "RoleToAttempt": role,
            },
            timeout=_LOGIN_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        pytest.fail(f"Login request falló ({login_url}): {exc}")

    if resp.status_code != 200:
        pytest.fail(
            f"Login devolvió {resp.status_code} (esperado 200) en {login_url}. "
            f"Body: {resp.text[:300]}"
        )

    try:
        token = resp.json().get("token")
    except ValueError:
        pytest.fail(f"Login no devolvió JSON en {login_url}. Body: {resp.text[:300]}")

    if not token:
        pytest.fail(f"Login 200 pero sin campo 'token' en {login_url}.")

    return token
