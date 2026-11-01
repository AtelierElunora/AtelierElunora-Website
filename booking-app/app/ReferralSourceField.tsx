import {useId, useState} from "react";
import {referralSources, type Referral} from "./referral-source";
export function ReferralSourceField({initial}: {initial?: Partial<Referral> | null}) {
  const [source, setSource] = useState(initial?.referralSource || "");
  const id = useId();
  return <div className="referral-fields" style={{display:"grid",gap:12}}>
    <label htmlFor={id}>How did you hear about us? (optional)
      <select id={id} name="referralSource" value={source} onChange={e=>setSource(e.target.value)} style={{display:"block",width:"100%",minHeight:46,fontSize:16}}>
        <option value="">Select an option</option>
        {referralSources.map(([value,label])=><option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    {source === "other" && <label htmlFor={id+"-details"}>Where did you hear about us? (optional)
      <input id={id+"-details"} name="referralDetails" defaultValue={initial?.referralDetails || ""} maxLength={200} placeholder="Tell us a little more"/>
    </label>}
  </div>;
}
