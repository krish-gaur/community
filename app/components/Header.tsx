'use client';
import Link from 'next/link';
import { Menu, Moon, Sun, X, ArrowUpRight } from 'lucide-react';
import { useEffect, useState } from 'react';

type Props={settings:Record<string,string>, session:{name:string;role:string}|null};
const fallback=[['Home','/'],['About','/about'],['Opportunities','/opportunities'],['Events','/events'],['Community','/join'],['Team','/team'],['Partners','/partners']];
export default function Header({settings,session}:Props){
 const [open,setOpen]=useState(false); const [light,setLight]=useState(false);
 const links=(()=>{try{return JSON.parse(settings.nav_json||'') as [string,string][]}catch{return fallback}})();
 useEffect(()=>{const saved=localStorage.getItem('agl-theme');if(saved==='light'){setLight(true);document.body.classList.add('light')}},[]);
 function toggle(){setLight(v=>{const next=!v; document.body.classList.toggle('light',next);localStorage.setItem('agl-theme',next?'light':'dark');return next});}
 return <header className="header"><div className="container header-inner"><Link href="/" className="brand" aria-label="AlGloryThM home"><img src={settings.logo_url||'/images/aiglorythm-logo.jpeg'} alt=""/>{settings.brand_name||'AlGloryThM'}</Link><nav className={'nav '+(open?'open':'')}>{links.map(([label,href])=><Link href={href} key={href} onClick={()=>setOpen(false)}>{label}</Link>)}</nav><div className="header-actions"><button className="theme" onClick={toggle} aria-label="Toggle color mode">{light?<Moon size={16}/>:<Sun size={16}/>}</button><Link href={session?.role==='admin'||session?.role==='super_admin'?'/admin':session?'/dashboard':'/auth/login'} className="btn btn-secondary btn-small hide-mobile">{session?'Dashboard':'Sign in'}</Link><Link href="/join" className="btn btn-primary btn-small hide-mobile">Join <ArrowUpRight size={14}/></Link><button className="theme mobile-trigger" onClick={()=>setOpen(!open)} aria-label="Open navigation">{open?<X size={17}/>:<Menu size={17}/>}</button></div></div></header>
}
