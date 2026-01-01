import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import {
  getOAuthConfig,
  YT_ACCESS_TOKEN_COOKIE,
  YT_REFRESH_TOKEN_COOKIE
} from '@/lib/youtube-oauth'

export const runtime = 'nodejs'

export async function GET() {
  const { configured } = getOAuthConfig()
  const cookieStore = cookies()
  const accessToken = cookieStore.get(YT_ACCESS_TOKEN_COOKIE)?.value
  const refreshToken = cookieStore.get(YT_REFRESH_TOKEN_COOKIE)?.value

  return NextResponse.json({
    configured,
    authorized: Boolean(accessToken || refreshToken)
  })
}
