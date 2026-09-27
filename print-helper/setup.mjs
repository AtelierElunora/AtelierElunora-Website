export function printerChoices(text,platform=process.platform){
 return String(text).split(/\r?\n/).map(line=>platform==='win32'?line.trim():line.match(/^printer (\S+) /)?.[1]).filter(name=>name&&name!=='No printers installed.').map(name=>({value:name,label:name}));
}
export function mediaChoices(text,platform=process.platform,profile='ds820-8x12'){
 if(platform==='win32')return String(text).split(/\r?\n/).map(line=>line.match(/^(\d+) : (.+)$/)).filter(m=>m&&m[2].includes(profile==='photo-4x6-single'?"(4 x 6 inches)":profile==='letter-four'?"(Letter 8.5 x 11 test only)":"(8 x 12 inches)")).map(m=>({value:m[1],label:m[2].replace(' test only','')}));
 const line=String(text).split(/\r?\n/).find(line=>/^PageSize\//.test(line));
 return (line?.split(':').slice(1).join(':').trim().split(/\s+/)||[]).map(x=>x.replace(/^\*/, '')).filter(x=>x&&(profile==='photo-4x6-single'?/^(4[_.xX-]*6|w288h432)$/i.test(x):profile==='letter-four'?/^Letter$/i.test(x):/8[_.xX-]*12/i.test(x))).map(value=>({value,label:value+' · verify paper size in your driver'}));
}

export function requireSavedPrinterSelection(saved,selected){
 if(!selected.profile||!selected.printer||!selected.media||['profile','printer','media','fontPath'].some(key=>(saved[key]||'')!==(selected[key]||'')))throw Error('Save printer settings for the selected paper size before printing a calibration sheet.');
}
