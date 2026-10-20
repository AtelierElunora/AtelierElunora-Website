import type {ActionFunctionArgs,LoaderFunctionArgs} from "react-router";
import {Form,Link,useActionData,useLoaderData,useNavigation} from "react-router";
import {authenticate} from "../shopify.server";
import db from "../db.server";
import {locked,requireOrigin} from "../booking.server";
import {parseConfig} from "../booking-rules";
import {agreementSettingFields,eventAgreementSettings,validateAgreementSettings} from "../event-agreement";
export async function loader({request}:LoaderFunctionArgs){
  const {session}=await authenticate.admin(request);
  const settings=await db.bookingSettings.upsert({where:{shop:session.shop},create:{shop:session.shop},update:{}});
  return {profile:eventAgreementSettings(JSON.parse(settings.configJson).eventAgreement),addons:parseConfig(settings.configJson).addons};
}
export async function action({request}:ActionFunctionArgs){
  const {session}=await authenticate.admin(request);requireOrigin(request);
  const form=await request.formData();
  try{
    const profile=eventAgreementSettings(Object.fromEntries([...agreementSettingFields.map(([key])=>[key,form.get(key)]),["enabled",form.get("enabled")==="yes"],["additionalHourAddonId",form.get("additionalHourAddonId")]]));
    validateAgreementSettings(profile);
    await locked(session.shop,async tx=>{
      const settings=await tx.bookingSettings.findUniqueOrThrow({where:{shop:session.shop}}),config=JSON.parse(settings.configJson);
      if(profile.enabled&&(settings.prepaymentPercent!==30||parseConfig(settings.configJson).currency!=="USD"))throw Error("This approved agreement requires a 30% retainer and USD. Update booking settings before enabling it.");
      if(profile.additionalHourAddonId&&!parseConfig(settings.configJson).addons.some(a=>a.id===profile.additionalHourAddonId))throw Error("Choose a current additional-hour add-on.");
      await tx.bookingSettings.update({where:{shop:session.shop},data:{configJson:JSON.stringify({...config,eventAgreement:profile})}});
    });
    return {success:"Contract settings saved. New bookings use these settings when enabled; existing agreements keep their saved version."};
  }catch(e){return {error:e instanceof Error?e.message:"Unable to save contract settings."};}
}
export default function Contracts(){
  const {profile,addons}=useLoaderData<typeof loader>(),result=useActionData<typeof action>(),navigation=useNavigation();
  return <s-page heading="Booking contracts"><link rel="stylesheet" href="/contract.css"/>
    <s-section heading="Your full event agreement"><p>Use your 20-section Photo Booth and Live Photo Magnet Service Agreement. Booking details fill in the agreement, customers preview a signature from their name, and each party explicitly signs the same saved document.</p><p><Link to="/app">Back to bookings</Link></p>
      {result&&<p role={"error"in result?"alert":"status"}>{"error"in result?result.error:result.success}</p>}
      <Form method="post" className="contract-sign-form" key={JSON.stringify(profile)}>
        {agreementSettingFields.map(([key,label])=><label key={key}>{label}<textarea name={key} defaultValue={profile[key]} maxLength={1000} rows={key==="providerAddress"||key==="backupDeletionPeriod"?3:1}/></label>)}
        <label>Additional live-service hour add-on<select name="additionalHourAddonId" defaultValue={profile.additionalHourAddonId}><option value="">No additional-hour add-on configured</option>{addons.map(a=><option value={a.id} key={a.id}>{a.name}</option>)}</select></label>
        <p>Choose the add-on that adds one live-service hour per unit so the contract records the correct service duration. Other add-ons retain their saved descriptions, quantities and prices.</p>
        <label className="contract-consent"><input type="checkbox" name="enabled" value="yes" defaultChecked={profile.enabled}/><span>Use this full agreement for new bookings. Business fields must be completed, with USD pricing and the approved 30% retainer. Your provider signature is still applied explicitly to each booking.</span></label>
        <button disabled={navigation.state!=="idle"}>{navigation.state!=="idle"?"Saving…":"Save contract settings"}</button>
      </Form>
      <p>Standard scope: four live-service hours, unlimited magnets during booked service, three artwork revisions, gallery access through one year after the event, U.S. shipping, and the approved production and cancellation wording. Customer and event fields remain specific to each booking. Missing required fields block signing.</p>
    </s-section></s-page>;
}

