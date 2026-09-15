import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static/ffprobe-static resolve their bundled binary path via
  // `__dirname` at require-time; letting Next bundle them rewrites that path
  // and breaks it at runtime (ENOENT). Keep them as real `require()`s instead.
  serverExternalPackages: ["ffmpeg-static", "ffprobe-static"],
};

export default nextConfig;
