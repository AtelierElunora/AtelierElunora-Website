process.argv.push('--only=experience');
if(!process.argv.includes('--check'))process.argv.push('--write');
await import('./verify-recovered-builds.mjs');
