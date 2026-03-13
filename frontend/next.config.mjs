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
};

export default nextConfig;
