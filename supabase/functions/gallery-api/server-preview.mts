import {readFile} from 'node:fs/promises';
import {ImageMagick, initializeImageMagick, MagickFormat, MagickReadSettings, MagickImageInfo, MagickColor, AlphaAction, ResourceLimits} from '@imagemagick/magick-wasm';

let initialization:Promise<void>|undefined;
async function initialize(){
 initialization ??= (async()=>{
  const bytes=await readFile(new URL('x86/magick.wasm',import.meta.resolve('@imagemagick/magick-wasm')));
  await initializeImageMagick(bytes);
  ResourceLimits.memory=128n*1024n*1024n;
  ResourceLimits.maxMemoryRequest=128n*1024n*1024n;
  ResourceLimits.disk=0n;
  ResourceLimits.listLength=16n;
  ResourceLimits.maxProfileSize=4n*1024n*1024n;
 })().catch(e=>{initialization=undefined;throw e;});
 await initialization;
}
export function imageMime(bytes:Uint8Array){
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return 'image/png';
 if(String.fromCharCode(...bytes.subarray(0,4))==='RIFF'&&String.fromCharCode(...bytes.subarray(8,12))==='WEBP')return 'image/webp';
 return '';
}
export async function makeServerPreview(bytes:Uint8Array){
 if(!bytes.length||bytes.length>15728640||!imageMime(bytes))throw Error('Use a JPEG, PNG or WebP image up to 15 MB.');
 await initialize();
 const format=imageMime(bytes)==='image/jpeg'?MagickFormat.Jpeg:imageMime(bytes)==='image/png'?MagickFormat.Png:MagickFormat.WebP;
 const settings=new MagickReadSettings({format,frameCount:1});
 // Bound allocation before decoding, and ask JPEG to decode at thumbnail scale.
 const info=MagickImageInfo.create(bytes,settings);
 const pixels=info.width*info.height;
 if(!pixels||pixels>60000000||info.width>20000||info.height>20000)throw Error('Image dimensions exceed the preview limit. Resize to 60 megapixels or less.');
 if(format!==MagickFormat.Jpeg&&pixels>12000000)throw Error('For large PNG or WebP images, upload a JPEG copy or resize to 12 megapixels or less.');
 if(Math.max(info.width,info.height)>1600)settings.setDefine(MagickFormat.Jpeg,'size','1600x1600');
 return ImageMagick.read(bytes,settings,image=>{
  image.autoOrient();
  const scale=Math.min(1,1600/Math.max(image.width,image.height));
  image.resize(Math.max(1,Math.round(image.width*scale)),Math.max(1,Math.round(image.height*scale)));
  image.backgroundColor=new MagickColor('#F4F2EF');image.alpha(AlphaAction.Remove);image.strip();
  for(const quality of [82,65,45]){
   image.quality=quality;
   const output=image.write(MagickFormat.Jpeg,data=>new Uint8Array(data));
   if(output.length>0&&output.length<=1048576)return output;
  }
  throw Error('Preview exceeds 1 MB. Resize this image and retry.');
 });
}
