// tests/helpers/assertions.ts
// Asserts contractuales reutilizables: shape Page<T>, List<T>, etc.

import { expect, type APIResponse } from '@playwright/test';

export async function expectStatusInRange(r: APIResponse, min: number, max: number): Promise<void> {
	expect(r.status(), `expected ${min}..${max}, got ${r.status()} body=${await safeBody(r)}`).toBeGreaterThanOrEqual(
		min
	);
	expect(r.status()).toBeLessThanOrEqual(max);
}

export async function expect2xx(r: APIResponse): Promise<void> {
	await expectStatusInRange(r, 200, 299);
}

export async function expectPageShape<T = unknown>(r: APIResponse): Promise<{ content: T[]; totalElements: number }> {
	await expect2xx(r);
	const body = (await r.json()) as { content?: T[]; totalElements?: number };
	expect(body, 'response is null/undefined').toBeDefined();
	expect(body).toHaveProperty('content');
	expect(Array.isArray(body.content)).toBe(true);
	expect(body).toHaveProperty('totalElements');
	return body as { content: T[]; totalElements: number };
}

export async function expectArray<T = unknown>(r: APIResponse): Promise<T[]> {
	await expect2xx(r);
	const body = (await r.json()) as T[];
	expect(Array.isArray(body)).toBe(true);
	return body;
}

export async function expectObjectWithProperty<T = unknown>(r: APIResponse, prop: string): Promise<T> {
	await expect2xx(r);
	const body = (await r.json()) as T;
	expect(body, 'response body falsy').toBeTruthy();
	// Cast a Record para que el matcher toHaveProperty sea visible al type checker.
	expect(body as Record<string, unknown>).toHaveProperty(prop);
	return body;
}

// Shape Page<T> anidada bajo `.page` (DTOs admin que envuelven la página:
// ListAdminDTO = { page: Page<T>, ... }, OwnerCheckingAccountResponseDTO = { page, totalBalance }).
export async function expectNestedPageShape<T = unknown>(
	r: APIResponse
): Promise<{ content: T[]; totalElements: number }> {
	await expect2xx(r);
	const body = (await r.json()) as { page?: { content?: T[]; totalElements?: number } };
	expect(body, 'response is null/undefined').toBeDefined();
	expect(body).toHaveProperty('page');
	const page = body.page ?? {};
	expect(page).toHaveProperty('content');
	expect(Array.isArray(page.content)).toBe(true);
	return page as { content: T[]; totalElements: number };
}

// Lee el cuerpo como JSON tolerando 200 con cuerpo vacío o no-JSON → retorna null.
// Útil para endpoints que responden 200 sin body (p.ej. validaciones que devuelven void)
// o cuerpos intermitentemente vacíos bajo concurrencia contra prod.
export async function readJsonSafe<T = unknown>(r: APIResponse): Promise<T | null> {
	const t = await r.text();
	if (t.trim() === '') return null;
	try {
		return JSON.parse(t) as T;
	} catch {
		return null;
	}
}

async function safeBody(r: APIResponse): Promise<string> {
	try {
		const t = await r.text();
		return t.length > 200 ? `${t.slice(0, 200)}...(trunc)` : t;
	} catch {
		return '(unreadable)';
	}
}
