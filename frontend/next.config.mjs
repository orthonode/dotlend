/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  turbopack: {},
  webpack: (config) => {
    // Kept for webpack fallback mode
    config.resolve.alias["@react-native-async-storage/async-storage"] = false;
    config.resolve.alias["pino-pretty"] = false;
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            // unsafe-eval required by WalletConnect/wagmi internals
            key: "Content-Security-Policy",
            value: "script-src 'self' 'unsafe-inline' 'unsafe-eval'; object-src 'none';",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
