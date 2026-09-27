process.argv.push('--only=station');
if(!process.argv.includes('--check'))process.argv.push('--write');
await import('./verify-recovered-builds.mjs');
