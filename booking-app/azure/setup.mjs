import { execFileSync } from 'node:child_process';
import { databaseBackend } from './booking-config.mjs';
import './generate-clients.mjs';

if (databaseBackend(process.env) === 'sqlite') {
  const prisma = new URL('../node_modules/prisma/build/index.js', import.meta.url).pathname;
  execFileSync(process.execPath, [prisma, 'migrate', 'deploy'], { stdio: 'inherit' });
} else {
  console.log('Azure schema must be applied separately through the reviewed migration. No migrations run at startup.');
}
