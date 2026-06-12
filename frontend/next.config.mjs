/** @type {import('next').NextConfig} */
const nextConfig = {
  basePath: '/daynote',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://daynote-backend:5000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
