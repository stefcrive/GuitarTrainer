import { NextResponse } from 'next/server'
import {
  SP_ACCESS_TOKEN_COOKIE,
  SP_EXPIRES_AT_COOKIE,
  SP_REFRESH_TOKEN_COOKIE
} from '@/lib/spotify-oauth'

export const runtime = 'nodejs'

function clearCookies() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(SP_ACCESS_TOKEN_COOKIE)
  response.cookies.delete(SP_REFRESH_TOKEN_COOKIE)
  response.cookies.delete(SP_EXPIRES_AT_COOKIE)
  return response
}

export async function POST() {
  return clearCookies()
}

// Convenience for browsers hitting the endpoint directly
export async function GET() {
  return clearCookies()
}
