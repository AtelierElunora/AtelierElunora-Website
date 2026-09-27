import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const here=fileURLToPath(new URL('.',import.meta.url));
// The OS handler deliberately accepts no URI arguments: a link can only open setup.
if(process.platform==='win32'){
 const key='HKCU\\Software\\Classes\\atelier-print';
 const reg=(args)=>execFileSync('reg.exe',args,{stdio:'pipe',windowsHide:true});
 reg(['add',key,'/ve','/d','URL:Atelier Print Helper','/f']);
 reg(['add',key,'/v','URL Protocol','/d','','/f']);
 reg(['add',key+'\\shell\\open\\command','/ve','/d',`"${process.execPath}" "${join(here,'launch.mjs')}"`,'/f']);
 console.log('Dashboard launch installed for this Windows user. Keep this helper folder in its current location.');
}else if(process.platform==='darwin'){
 const apps=join(homedir(),'Applications');mkdirSync(apps,{recursive:true});
 const app=join(apps,'Atelier Print Helper.app');
 const quote=s=>"'"+s.replaceAll("'","'\\''")+"'";
 const command=quote(process.execPath)+' '+quote(join(here,'launch.mjs'))+' >/dev/null 2>&1 &';
 const script='on run\n do shell script '+JSON.stringify(command)+'\nend run\non open location ignoredURL\n run\nend open location\n';
 const source=join(here,'dashboard-launch.applescript');writeFileSync(source,script);
 execFileSync('/usr/bin/osacompile',['-o',app,source]);
 const plist=join(app,'Contents','Info.plist');
 execFileSync('/usr/bin/plutil',['-replace','CFBundleIdentifier','-string','com.atelierelunora.printhelper',plist]);
 execFileSync('/usr/bin/plutil',['-replace','CFBundleURLTypes','-json',JSON.stringify([{CFBundleURLName:'Atelier Print Helper',CFBundleURLSchemes:['atelier-print']}]),plist]);
 execFileSync('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',['-f',app]);
 console.log('Dashboard launch installed in your Applications folder. Keep the helper folder in its current location.');
}else throw Error('Use Windows or macOS.');
