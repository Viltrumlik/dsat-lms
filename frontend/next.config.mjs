/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Ships a self-contained server plus only the node_modules it actually
  // imports — the production image goes from "copy the whole tree" to a few
  // hundred MB less, and there is no `npm install` at container start.
  output: 'standalone',
  // The version banner is free reconnaissance.
  poweredByHeader: false,
  compress: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost' },
    ],
  },
}

export default nextConfig
