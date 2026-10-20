import { execFileSync } from 'node:child_process';

const prisma = new URL('../node_modules/prisma/build/index.js', import.meta.url).pathname;
execFileSync(process.execPath, [prisma, 'generate'], { stdio: 'inherit' });
execFileSync(process.execPath, [prisma, 'generate', '--schema', 'prisma/schema.azure.prisma'], {
  stdio: 'inherit',
  // Generation does not connect to a database. This placeholder is never used
  // by the managed identity runtime adapter or by migration commands.
  env: { ...process.env, AZURE_BOOKING_DATABASE_URL: 'postgresql://generation@localhost:5432/generation?schema=elunora_booking' },
});
