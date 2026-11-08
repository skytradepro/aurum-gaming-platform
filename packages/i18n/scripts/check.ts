import { fileURLToPath } from 'node:url';
import { checkCatalogs, flatten, loadCatalogs } from '../src/check.ts';

const directory = fileURLToPath(new URL('../messages', import.meta.url));
const catalogs = loadCatalogs(directory);
const problems = checkCatalogs(catalogs);

for (const [locale, catalog] of Object.entries(catalogs)) {
  console.log(`${locale}: ${flatten(catalog).size} messages`);
}
for (const p of problems) {
  console.log(`${p.severity.toUpperCase()} [${p.locale}] ${p.key}: ${p.message}`);
}
const errors = problems.filter((p) => p.severity === 'error').length;
const warnings = problems.length - errors;
console.log(errors === 0 ? `i18n check passed (${warnings} warning(s))` : `i18n check FAILED: ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors === 0 ? 0 : 1);
