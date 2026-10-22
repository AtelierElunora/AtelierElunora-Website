export const followupKinds=["lead_followup_1","lead_followup_2"];
export const followupSuccess=["submitted","accepted","sent","delivered"];
export const followupFailures=["failed","review","bounced","complained","suppressed"];
export const DAY=86400000;
export type FollowupConfig={enabled:boolean;since:string};
export function followupConfig(raw:string):FollowupConfig {
  const c=JSON.parse(raw).leadFollowup;
  return {enabled:c?.enabled===true && Number.isFinite(Date.parse(c.since)),since:c?.since||""};
}
type GroupLead={id:string;customerEmail:string;createdAt:Date};
// Fixed cohorts prevent repeated form submissions from starting extra sequences.
// A new, explicitly consented inquiry after fourteen days can start a new one.
export function inquiryGroups<T extends GroupLead>(leads:T[]) {
  const byEmail=new Map<string,T[][]>();
  for(const lead of [...leads].sort((a,b)=>a.createdAt.getTime()-b.createdAt.getTime())) {
    const key=lead.customerEmail.trim().toLowerCase(),cohorts=byEmail.get(key)||[],last=cohorts.at(-1);
    if(!last || lead.createdAt.getTime()-last[0].createdAt.getTime()>14*DAY) cohorts.push([lead]);
    else last.push(lead);
    byEmail.set(key,cohorts);
  }
  return [...byEmail.values()].map(cohorts=>cohorts.at(-1)!);
}
export const followupId=(anchor:string,stage:1|2)=>`inquiry:${anchor}:${stage}`;
