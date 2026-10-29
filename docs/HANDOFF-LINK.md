# HANDOFF — single source of truth

Este repo **no** mantiene un HANDOFF.md propio (regla operativa del proyecto QA API Magiis: un único doc de estado para todo el pipeline).

El HANDOFF unificado vive en:

```
C:\Users\Erika\OneDrive - MAGIIS USA LLC (1)\Escritorio\qa-api-magiis\HANDOFF.md
```

Contiene:

- Estado de las Fases A → D del proyecto QA API Magiis.
- Workspace Postman (UIDs collections + environments).
- Cobertura backend (51/63 controllers + huérfanos legacy).
- Decisiones tomadas (no relitigar).
- Hallazgos del smoke 2026-05-28 (bugs reales del backend).
- Próxima etapa: OpenAPI / Schemathesis.

**Si modificás algo arquitectónico de este repo** (estructura de carpetas, fixtures, generador, CI), actualizá la sección Fase D del HANDOFF — no creés un HANDOFF separado acá.
