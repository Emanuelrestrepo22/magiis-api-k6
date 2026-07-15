// commitlint.config.js — convención: <tipo>(<scope>): [TS-API-TC###|MX-XXXX] descripción
export default {
	extends: ['@commitlint/config-conventional'],
	rules: {
		'subject-case': [0],
		'header-max-length': [2, 'always', 100]
	}
};
