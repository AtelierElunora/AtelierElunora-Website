import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
import type {Content,TDocumentDefinitions} from "pdfmake/interfaces";
import {contractRows,type BookingContract} from "./booking-contract";

pdfMake.addVirtualFileSystem(pdfFonts);
// The document uses bundled fonts and literal text only; never fetch remote resources.
pdfMake.setUrlAccessPolicy(()=>false);

export type SignatureImages={client?:string;provider?:string};
export function contractPdfFilename(c:BookingContract){
  const reference=c.document.reference.replace(/[^a-z0-9_-]/gi,"-").slice(0,80)||"booking";
  return "Atelier-Elunora-Agreement-"+reference+"-r"+c.revision+".pdf";
}
export function contractPdfDefinition(c:BookingContract,images:SignatureImages={}):TDocumentDefinitions{
  const d=c.document,a=d.serviceAgreement;
  const content:Content[]=[
    {text:"ATELIER ELUNORA",style:"brand"},
    {text:a?.title||"Your booking contract",style:"title"},
    {text:"Reference "+d.reference+"  |  Revision "+c.revision,style:"small",margin:[0,0,0,20]},
  ];
  if(a){
    content.push({text:a.introduction,margin:[0,0,0,12]});
    if(a.missingFields.length)content.push({text:"INCOMPLETE - not available for signing. Required: "+a.missingFields.join("; "),bold:true,margin:[0,0,0,12]});
    for(const section of a.sections){
      content.push({text:section.heading,style:"heading",headlineLevel:1});
      for(const text of section.paragraphs)content.push({text,margin:[0,0,0,9]});
    }
  }else{
    for(const [label,value]of contractRows(d))content.push({text:[{text:label+": ",bold:true},value],margin:[0,0,0,7]});
    content.push({text:"You may pay the prepayment shown above or the full booking amount. Additional tax, if applicable, appears at Shopify checkout.",margin:[0,8,0,12]});
    if(d.bookingNotes)content.push({text:"Booking notes",style:"heading"},{text:d.bookingNotes});
    if(d.quoteNotes)content.push({text:"Approved quote notes",style:"heading"},{text:d.quoteNotes});
    content.push({text:"Booking and cancellation terms - version "+d.termsVersion,style:"heading"},{text:d.termsText,margin:[0,0,0,12]});
  }
  function receipt(label:string,person:BookingContract["signature"]|BookingContract["providerSignature"],image?:string){
    const rows:Content[]=[{text:label,style:"heading"}];
    if(person){
      if(image)rows.push({image,width:360,margin:[0,2,0,6]});
      rows.push({text:person.name,fontSize:14,italics:true,margin:[0,0,0,5]},
        {text:("email"in person?person.email:person.title)+"\n"+person.signedAt+" (UTC)",style:"small"},
        {text:"Signature appearance: "+(person.style==="script"?"Handwritten style":"Classic"),style:"small",margin:[0,4,0,5]},
        {text:person.consent,margin:[0,5,0,0]});
    }else rows.push({text:"Awaiting electronic signature."});
    content.push({stack:rows,unbreakable:true,margin:[0,8,0,15]});
  }
  receipt(a?(c.signature?"Client electronically signed":"Client signature"):"Electronic signature",c.signature,images.client);
  if(a?.requiresProviderSignature)receipt(c.providerSignature?"Provider electronically signed":"Provider signature",c.providerSignature,images.provider);
  content.push({text:"Document SHA-256\n"+c.hash.slice(0,32)+"\n"+c.hash.slice(32),style:"small",margin:[0,12,0,0]});
  if(a)content.push({text:"Agreement source: "+a.sourceVersion,style:"small",margin:[0,6,0,0]});
  return {
    pageSize:"LETTER",pageMargins:[48,48,48,48],
    info:{title:"Atelier Elunora agreement - "+d.reference,author:d.business,subject:"Booking agreement revision "+c.revision},
    defaultStyle:{font:"Roboto",fontSize:10,lineHeight:1.2,color:"#303226"},
    styles:{brand:{fontSize:10,bold:true,color:"#565b40",characterSpacing:2},
      title:{fontSize:23,color:"#454734",margin:[0,10,0,10]},
      heading:{fontSize:12,bold:true,color:"#454734",margin:[0,13,0,7]},
      small:{fontSize:8,color:"#5b5d51",lineHeight:1.1}},
    content,
    footer:(page,total)=>({text:"ATELIER ELUNORA  |  "+page+" / "+total,alignment:"center",fontSize:8,color:"#656851",margin:[0,16,0,0]}),
    pageBreakBefore:(node,container)=>node.headlineLevel===1&&container.getFollowingNodesOnPage().length===0,
  };
}
export async function createContractPdf(c:BookingContract,images:SignatureImages={}):Promise<Blob>{
  return pdfMake.createPdf(contractPdfDefinition(c,images)).getBlob();
}
