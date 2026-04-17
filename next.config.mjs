/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keeps GPU-bound libraries (ffmpeg, spawn, etc.) out of the Edge bundle.
  // GPU routes use dynamic imports + environment.ts guards to skip on Vercel.
  output: "standalone",
  experimental: {
    // These packages use Node APIs; Next.js should not try to bundle them
    // into the server output.
    serverComponentsExternalPackages: ["@supabase/auth-helpers-nextjs"],
  },
};

export default nextConfig;
