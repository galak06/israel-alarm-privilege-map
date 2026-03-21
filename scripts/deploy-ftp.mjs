/**
 * FTP deploy script — uploads dist/ to Hostinger.
 * Credentials are read from environment variables (set in .claude/settings.local.json).
 *
 * Usage:  node scripts/deploy-ftp.mjs
 *    or:  npm run deploy
 */

import * as ftp from 'basic-ftp';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');

const HOST   = process.env.FTP_HOST     || 'ftp.israel-privilege-map.padushka.com';
const USER   = process.env.FTP_USERNAME || 'u561641246.claude';
const PASS   = process.env.FTP_PASSWORD;
const REMOTE = process.env.FTP_REMOTE_PATH || '/';

if (!PASS) {
  console.error('❌  FTP_PASSWORD env var is required.');
  process.exit(1);
}

const client = new ftp.Client();
client.ftp.verbose = false;

try {
  console.log(`🚀 Deploying dist/ → ftp://${HOST}${REMOTE}`);
  await client.access({ host: HOST, user: USER, password: PASS, secure: false });
  await client.ensureDir(REMOTE);
  await client.clearWorkingDir();
  await client.uploadFromDir(DIST);
  console.log('✅  Deploy complete!');
} catch (err) {
  console.error('❌  Deploy failed:', err.message);
  process.exit(1);
} finally {
  client.close();
}
