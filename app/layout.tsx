import type { Metadata } from 'next';
import './globals.css';
import { getSettings } from '@/app/lib/db';
export async function generateMetadata():Promise<Metadata>{const s=getSettings();return {metadataBase:new URL(process.env.NEXT_PUBLIC_SITE_URL||'http://localhost:3000'),title:{default:s.seo_title||'AlGloryThM',template:`%s | ${s.brand_name||'AlGloryThM'}`},description:s.seo_description,icons:{icon:s.favicon_url||'/images/aiglorythm-logo.jpeg'},openGraph:{title:s.seo_title,description:s.seo_description,images:s.logo_url?[s.logo_url]:[]},twitter:{card:'summary_large_image',title:s.seo_title,description:s.seo_description}}}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
