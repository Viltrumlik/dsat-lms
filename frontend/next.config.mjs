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
    // Empty on purpose. `hostname: '**'` turned /_next/image into an open proxy:
    // anyone could hand it any https URL and have this server fetch, cache and
    // re-serve it — someone else's bandwidth bill, paid by us, from an IP that
    // looks like ours.
    //
    // Nothing loses anything, because `next/image` is not imported anywhere in
    // src/ — question figures, avatars and attachments are all plain <img> with
    // an auth'd or presigned URL. If the optimizer is ever adopted, add the
    // specific hosts here; do not restore the wildcard.
    remotePatterns: [],
  },
}

export default nextConfig
