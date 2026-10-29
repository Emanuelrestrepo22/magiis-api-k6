// tests/specs/controllers/operation-characteristic.api.test.ts
// OperationCharacteristicController — base operationCharacteristic (catálogo global).
// Contrato: docs/reference/backend-endpoints-v1.72.2.md (§8.61).

import { test, expect } from '@TestBase';
import { expectArray } from '@helpers';

test.describe('OperationCharacteristicController', () => {
	test('Validar GET /operationCharacteristic retorna catálogo de características', async ({ magiisApi }) => {
		const r = await magiisApi.getJson('operationCharacteristic');
		const list = await expectArray<{ id: number; code: string; category: string; enabled: boolean }>(r);
		if (list.length > 0) {
			expect(list[0]).toHaveProperty('code');
			expect(list[0]).toHaveProperty('category');
		}
	});
});
