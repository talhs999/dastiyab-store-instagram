/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      "@whiskeysockets/baileys",
      "pino",
      "qrcode",
    ],
  },
};

export default nextConfig;
