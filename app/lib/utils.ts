export function dateFormat(value?:string){ if(!value) return 'Date to be announced'; const d=new Date(value); return Number.isNaN(d.getTime()) ? value : new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric',hour:value.includes('T')?'numeric':undefined,minute:value.includes('T')?'2-digit':undefined}).format(d); }
export function isExternal(url:string){ return /^https?:\/\//.test(url); }
export function safeJson<T>(input:string, fallback:T):T{try{return JSON.parse(input) as T;}catch{return fallback;}}
