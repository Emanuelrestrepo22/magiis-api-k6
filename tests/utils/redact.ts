// tests/utils/redact.ts
// Helper único de redacción de secretos en volcados de error/log.
// Motivo: un fallo de red (ej. "socket hang up") en apiRequestContext.fetch de
// Playwright embebe el call log completo -- headers incluidos -- en error.message.
// Si ese mensaje se usa como comment/log (ej. xray-reporter), el token queda
// expuesto tal cual en el sistema de destino (Xray, CI logs, etc.).
//
// Uso: pasar CUALQUIER texto de diagnóstico (error.message, call log, request
// serializado) antes de loguearlo, guardarlo o exportarlo. Preserva el resto
// del volcado -- solo reemplaza el VALOR del header sensible.
//
// Cobertura: headers cuyo nombre matchea (case-insensitive) alguno de:
//   authorization, cookie, set-cookie, x-api-key, proxy-authorization
const SENSITIVE_HEADER_NAMES = ['authorization', 'cookie', 'set-cookie', 'x-api-key', 'proxy-authorization'];

// Cobertura adicional: CLAVES DE DATO sensibles que viajan en un body JSON o en
// un query-string, no como header. Un header vive en su propia línea/entrada y su
// valor llega hasta el fin de línea; una clave de dato vive dentro de un objeto y
// su valor es un string JSON entrecomillado (o un "campo=valor" en query-string).
// Por eso son DOS familias de patrón separadas -- mezclarlas hace que se coma el
// resto del JSON o que deje pasar el valor.
//
// El match NUNCA se ancla a la palabra suelta (por eso "expected token to be
// truthy" o "el token de la ruta no se resolvió" no se tocan): siempre requiere
// el contexto estructurado -- clave JSON entrecomillada seguida de ":", o
// "campo=valor" en query-string.
const SENSITIVE_DATA_KEY_NAMES = [
	'token',
	'access_token',
	'refresh_token',
	'id_token',
	'password',
	'secret',
	'client_secret',
	'api_key',
	'apiKey',
	'private_key'
];

const REDACTED = '[REDACTED]';

// Matchea "<header-name>: <valor>" tal como aparece en:
//   - call log de Playwright: "  - authorization: Bearer eyJ..."
//   - headers serializados JSON: "\"Authorization\": \"Bearer eyJ...\""
//   - texto plano: "Authorization: Bearer eyJ..."
// Grupo 1 = prefijo completo hasta el valor (ancla de contexto + nombre + separador,
//   comillas incluidas). El nombre solo matchea si está anclado a un contexto real de
//   header -- inicio de línea, o inmediatamente después de "{", "," o un salto de línea --
//   NUNCA a mitad de una oración (ej. "insufficient authorization: ..." no matchea).
// Grupo 2 = valor entre comillas JSON (si aplica) -- se usa solo para saber si había comillas.
// El valor se corta en fin de línea o comilla/llave de cierre de JSON -- NUNCA en una coma,
// porque un Set-Cookie real (con "Expires=...GMT") y un set-cookie con múltiples cookies
// unidas por ", " contienen comas legítimas dentro del propio valor.
function buildHeaderPattern(name: string): RegExp {
	return new RegExp(
		`((?:^|[\\r\\n{,])\\s*[-*]?\\s*"?\\b${name}\\b"?\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*"|[^\\r\\n}]*)`,
		'gim'
	);
}

const HEADER_PATTERNS = SENSITIVE_HEADER_NAMES.map(buildHeaderPattern);

// Matchea "<clave-json>":"<valor>" -- la clave y el valor van SIEMPRE entrecomillados
// en JSON, así que anclar a las comillas + ":" descarta la prosa suelta (ej. "el
// token de la ruta..." no tiene comillas ni ":" pegado, no matchea). No hace falta
// ancla adicional de inicio-de-línea/`{`/`,` porque `"<name>":"..."` ya es, por
// construcción, una clave de objeto -- no aparece así en una oración.
// Grupo 1 = clave entrecomillada + ":" (se preserva tal cual).
// Grupo 2 = valor JSON entrecomillado completo (se reemplaza por "[REDACTED]").
function buildJsonDataKeyPattern(name: string): RegExp {
	return new RegExp(`("${name}"\\s*:\\s*)("(?:[^"\\\\]|\\\\.)*")`, 'gi');
}

// Matchea "<clave>=<valor>" en formato query-string (ej. "password=...&user=...").
// Ancla a inicio de string, "&", "?" o whitespace antes de la clave -- nunca a
// mitad de palabra -- y corta el valor en "&" o whitespace, nunca se come el resto
// del query-string.
// Grupo 1 = ancla + clave + "=" (se preserva). Grupo 2 = valor (se reemplaza).
function buildQueryDataKeyPattern(name: string): RegExp {
	return new RegExp(`((?:^|[&?\\s])${name}=)([^&\\s]*)`, 'gi');
}

const JSON_DATA_KEY_PATTERNS = SENSITIVE_DATA_KEY_NAMES.map(buildJsonDataKeyPattern);
const QUERY_DATA_KEY_PATTERNS = SENSITIVE_DATA_KEY_NAMES.map(buildQueryDataKeyPattern);

/**
 * Redacta el valor de cualquier header sensible (Authorization, Cookie, Set-Cookie,
 * X-Api-Key, Proxy-Authorization -- case-insensitive), y el valor de cualquier
 * CLAVE DE DATO sensible (token, access_token, refresh_token, id_token, password,
 * secret, client_secret, api_key/apiKey, private_key -- case-insensitive) presente
 * en `text`, ya sea como clave JSON entrecomillada o como "campo=valor" en
 * query-string. Preserva el resto del contenido para que el diagnóstico siga
 * siendo útil.
 */
export function redactSecrets(text: string): string {
	if (!text) return text;
	let result = text;
	for (const pattern of HEADER_PATTERNS) {
		result = result.replace(pattern, (fullMatch, prefix: string, value: string) => {
			void fullMatch;
			const valueWasQuoted = /^".*"$/.test(value);
			return `${prefix}${valueWasQuoted ? `"${REDACTED}"` : REDACTED}`;
		});
	}
	for (const pattern of JSON_DATA_KEY_PATTERNS) {
		result = result.replace(pattern, (fullMatch, prefix: string) => {
			void fullMatch;
			return `${prefix}"${REDACTED}"`;
		});
	}
	for (const pattern of QUERY_DATA_KEY_PATTERNS) {
		result = result.replace(pattern, (fullMatch, prefix: string) => {
			void fullMatch;
			return `${prefix}${REDACTED}`;
		});
	}
	return result;
}
