import { loadProductionSecrets } from './secrets.mjs';
try {
  loadProductionSecrets(process.env);
} catch (error) {
  // Errors deliberately contain neither values nor paths.
  console.error(JSON.stringify({ status: 'failed', error: error.message }));
  process.exit(1);
}
