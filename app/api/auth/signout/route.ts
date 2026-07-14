import { createClient } from '@/lib/supabase/server'
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

async function handler() {
  const supabase = await createClient()
  
  // Sign out server-side
  await supabase.auth.signOut()
  
  // Explicitly clear all Supabase auth cookies
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  
  const response = NextResponse.json({ success: true })
  
  // Delete all sb-* cookies (Supabase auth cookies)
  allCookies
    .filter(cookie => cookie.name.startsWith('sb-'))
    .forEach(cookie => {
      response.cookies.delete(cookie.name)
    })
  
  return response
}

export const POST = withSecurity(handler, SECURITY_PRESETS.AUTHENTICATED)
