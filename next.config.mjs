/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    domains: ['i.ytimg.com', 'img.youtube.com', 'i.scdn.co', 'mosaic.scdn.co'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://www.youtube-nocookie.com",
              "style-src 'self' 'unsafe-inline'",
      "media-src 'self' blob: https://*.youtube.com https://*.ytimg.com",
      "img-src 'self' data: https://*.youtube.com https://*.ytimg.com https://*.scdn.co",
      "frame-src 'self' https://*.youtube.com https://www.youtube-nocookie.com",
      "connect-src 'self' https://*.googleapis.com https://*.youtube.com https://www.youtube-nocookie.com https://api.spotify.com https://accounts.spotify.com",
              "script-src-elem 'self' 'unsafe-inline' https://www.youtube.com https://www.youtube-nocookie.com",
              "worker-src 'self' blob:",
              "child-src 'self' https://*.youtube.com https://www.youtube-nocookie.com"
            ].join('; ')
          },
          {
            key: 'Permissions-Policy',
            value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          }
        ]
      }
    ]
  },
  env: {
    NEXT_PUBLIC_YOUTUBE_API_KEY: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY
  }
}

export default nextConfig
