export function moneyToCents(money:{amount:string;currencyCode:string},currency:string):number;
export function reconcileOrder(booking:any,link:any,order:any):any;
export function paymentPlan(total:number,percent:number,paid?:number):{prepaymentCents:number;fullPaymentCents:number;balanceCents:number};
