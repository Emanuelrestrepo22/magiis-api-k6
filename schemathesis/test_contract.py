"""Contract fuzzing del backend Magiis contra ../openapi.yaml (Schemathesis 3.x).

Cómo funciona:
- `schemathesis.from_path` carga y parsea el spec en tiempo de IMPORT (no pega
  al backend), y `@schema.parametrize()` genera UN test por operación del spec.
  Por eso `pytest --collect-only` funciona SIN credenciales ni red.
- La EJECUCIÓN real (`case.call_and_validate`) sí hace requests HTTP y solo
  ocurre si hay `auth_token`. Sin token, cada test hace `skip`.

Política (docs/SCOPE.md): LOCAL-ONLY, OPT-IN, NO pegarle al backend sin luz
verde del QA Lead. Default: TEST (apps-test.example.com).
"""

from pathlib import Path

import pytest
import schemathesis

from conftest import build_base_url

# Spec OpenAPI 3.0 en la raíz del repo (carpeta padre de schemathesis/).
_SPEC_PATH = Path(__file__).resolve().parent.parent / "openapi.yaml"

# base_url se resuelve en import: solo se USA al llamar (call_and_validate).
# Cargar el schema NO dispara ningún request.
schema = schemathesis.from_path(str(_SPEC_PATH), base_url=build_base_url())


@pytest.mark.contract
@schema.parametrize()
def test_openapi_contract(case, auth_token):
    """Valida cada operación del spec: genera datos, llama y chequea contrato.

    call_and_validate corre los checks default de Schemathesis (status code vs.
    spec, conformidad de content-type, del schema de respuesta, etc.).
    """
    if not auth_token:
        pytest.skip(
            "Sin LOGIN_USER/LOGIN_PASSWORD: modo colección/diseño "
            "(OPT-IN — requiere credenciales + luz verde del QA Lead para pegar "
            "al backend). Ver README.md."
        )
    case.call_and_validate(headers={"Authorization": f"Bearer {auth_token}"})
