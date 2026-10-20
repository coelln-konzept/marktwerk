import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The monorepo keeps one .env at the root; Next.js only loads env files from apps/web.
// In production the platform provides real environment variables instead.
try {
  process.loadEnvFile(new URL("../../.env", import.meta.url));
} catch {
  // no root .env (CI/production)
}

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  // Self-contained server build so we can deploy to Vercel or a Docker host (ADR 0006).
  output: "standalone",
  // Internal workspace packages ship TypeScript source.
  transpilePackages: ["@marktwerk/core", "@marktwerk/db"],
  // Cache Components is off on purpose: almost every screen is per-user and
  // behind login, so the static-shell model adds friction without benefit (ADR 0004).
  typedRoutes: true,
  experimental: {
    // enables forbidden()/unauthorized() used by requirePermission()
    authInterrupts: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default withNextIntl(nextConfig);
