// tests/components/api/ApiBase.ts
// KATA Architecture — Layer 2: base de componentes API.
//
// Extiende TestContext (L1) para heredar el transporte HTTP (`this.api` = MagiisApiClient)
// y la config de runtime (`this.cfg`). Los componentes de dominio (L3) extienden esta clase
// y exponen sus ATCs (método = acción + fixed assertions).
//
// DI: el MagiisApiClient sigue siendo el transporte interno (se envuelve, no se reemplaza).
// El constructor acepta el cliente por posición para no romper el fixture existente
// (`new XxxApi(magiisApi)`); internamente lo adapta a las TestContextOptions de L1.

import type { MagiisApiClient } from '@clients/magiis-api-client';
import { TestContext } from '@TestContext';

export abstract class ApiBase extends TestContext {
	constructor(api: MagiisApiClient) {
		super({ api });
	}
}
