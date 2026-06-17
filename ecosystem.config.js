// PM2 process config for the DigitalOcean droplet (134.209.38.234).
// Runs the Next.js production server (`next start`) on port 3002 behind nginx.
// Mirrors the thought-post deployment pattern.
module.exports = {
  apps: [
    {
      name: "library-search",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3002",
      cwd: "./",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: "3002",
      },
    },
  ],
};
