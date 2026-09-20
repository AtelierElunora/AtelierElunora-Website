import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
await build({entryPoints:[fileURLToPath(new URL('../shopify-owner-app/extensions/gallery-owner/src/AppHome.jsx',import.meta.url))],bundle:true,external:['preact','preact/*','@shopify/*'],write:false});
console.log('PASS: owner app bundle builds without writing platform-specific temporary paths.');
