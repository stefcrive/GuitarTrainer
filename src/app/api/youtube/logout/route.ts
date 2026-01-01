import { NextResponse } from 'next/server'
import {
  YT_ACCESS_TOKEN_COOKIE,
  YT_EXPIRES_AT_COOKIE,
  YT_REFRESH_TOKEN_COOKIE
} from '@/lib/youtube-oauth'

export const runtime = 'nodejs'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.delete(YT_ACCESS_TOKEN_COOKIE)
  response.cookies.delete(YT_REFRESH_TOKEN_COOKIE)
  response.cookies.delete(YT_EXPIRES_AT_COOKIE)
  return response
}
