import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The repo root holds its own package.json for the database test suite, so
  // Next infers the workspace root one level too high and warns about multiple
  // lockfiles. Pin it to the app.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
