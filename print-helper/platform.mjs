import {cupsAdapter,listPrinters as macPrinters,listMedia as macMedia} from './cups.mjs';
import {windowsAdapter,listWindowsPrinters,listWindowsMedia} from './windows.mjs';
export function printerAdapter(config){
 if(process.platform==='win32')return windowsAdapter(config);
 if(process.platform==='darwin')return {format:'pdf',extension:'.pdf',...cupsAdapter(config)};
 throw Error('Run the print helper on Windows or macOS.');
}
export const listPrinters=()=>process.platform==='win32'?listWindowsPrinters():macPrinters();
export const listMedia=printer=>process.platform==='win32'?listWindowsMedia(printer):macMedia(printer);
