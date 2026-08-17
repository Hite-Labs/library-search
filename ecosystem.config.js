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
        // Cohort schedules are plotted by stepping a local-time date (lib/db.ts
        // generateCohortSchedule), so that a 7pm session stays 7pm after a DST change
        // instead of drifting to 6pm. A droplet left on UTC has no DST, which would make
        // that arithmetic inert and reintroduce the drift for members in a DST zone.
        // Pinning the coach's zone here is what makes the fix real in production.
        TZ: "America/New_York",
      },
    },
  ],
};
