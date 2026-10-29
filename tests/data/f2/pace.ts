// tests/data/f2/pace.ts
// Ritmo entre llamadas al backend TEST (regla de la campaña: >= 4 s entre requests). No usa
// `waitForTimeout`: es una espera de tiempo mínimo medida desde el FIN de la llamada anterior
// (`markCallDone`, que invoca `observe`), no una espera de sincronización de UI.

const MIN_GAP_MS = 4_000;
let lastCallDoneAt = 0;

/** Marca el fin de la llamada en curso (la respuesta ya llegó). */
export function markCallDone(): void {
	lastCallDoneAt = Date.now();
}

/** Espera lo que falte para respetar el intervalo mínimo desde el fin de la llamada anterior. */
export async function pace(): Promise<void> {
	const wait = lastCallDoneAt + MIN_GAP_MS - Date.now();
	if (wait > 0) await new Promise<void>((resolve) => setTimeout(resolve, wait));
}
