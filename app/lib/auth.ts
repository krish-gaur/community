import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/app/lib/db';

const secret = new TextEncoder().encode(process.env.JWT_SECRET || 'development-only-change-this-long-secret-for-aiglorythm');
const cookieName = 'aiglorythm_session';
export type Session = { id:number; email:string; role:'member'|'admin'|'super_admin'; name:string };

export async function issueToken(payload: Session) { return new SignJWT(payload).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('7d').sign(secret); }
export async function readSession():Promise<Session|null> {
 try { const token=(await cookies()).get(cookieName)?.value; if(!token) return null; const {payload}=await jwtVerify(token,secret); return {id:Number(payload.id),email:String(payload.email),role:payload.role as Session['role'],name:String(payload.name||'Member')}; } catch { return null; }
}
export async function setSession(session:Session) { const token=await issueToken(session); (await cookies()).set(cookieName,token,{httpOnly:true, secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:60*60*24*7}); }
export async function clearSession() {(await cookies()).set(cookieName,'',{httpOnly:true,path:'/',maxAge:0}); }
export async function requireUser(){ const s=await readSession(); if(!s) redirect('/auth/login?next=/dashboard'); return s; }
export async function requireAdmin(){ const s=await readSession(); if(!s || !['admin','super_admin'].includes(s.role)) redirect('/auth/login?next=/admin'); return s; }
export async function sessionFromCredentials(email:string,password:string) {
 const bcrypt=(await import('bcryptjs')).default;
 const row=db().prepare('SELECT u.id,u.email,u.password_hash,u.role,u.status,p.full_name FROM users u LEFT JOIN profiles p ON p.user_id=u.id WHERE lower(u.email)=lower(?)').get(email) as {id:number,email:string,password_hash:string,role:Session['role'],status:string,full_name:string}|undefined;
 if(!row || row.status!=='active' || !bcrypt.compareSync(password,row.password_hash)) return null;
 return {id:row.id,email:row.email,role:row.role,name:row.full_name || row.email.split('@')[0]};
}
