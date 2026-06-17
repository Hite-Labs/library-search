# Deployment — DigitalOcean droplet (134.209.38.234)

library-search runs as a Next.js production server (`next start`) under **PM2** on port
**3002**, behind nginx, on the same droplet as thought-post (which uses port 3001). Pushing
to `main` triggers `.github/workflows/deploy.yml`, which SSHes in, pulls, builds, and reloads
PM2.

> ⚠️ Pushing to `main` deploys live. A broken build takes down the running app. Always
> `npm run build` locally before committing.

---

## One-time setup (run once on the droplet)

SSH in: `ssh root@134.209.38.234`

### 1. Clone the repo
```bash
cd ~
git clone https://github.com/Hite-Labs/library-search.git
cd library-search
```

### 2. Create the production env file
Create `/root/library-search/.env` with the real production keys (copy values from your
local `.env.local`). Next.js auto-loads `.env` at runtime.
```bash
nano .env
```
Required keys (see `.env.example`):
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL_BASE=
WEBFLOW_API_KEY=
WEBFLOW_COLLECTION_ID=
NEON_DATABASE_URL=
ANTHROPIC_API_KEY=
VOYAGE_API_KEY=
ASSEMBLYAI_API_KEY=
UPLOAD_TOOL_PASSWORD=
SESSION_SECRET=
NEXT_PUBLIC_APP_URL=https://<your-domain>
```

### 3. Build and start under PM2
```bash
npm ci
npm run build
pm2 start ecosystem.config.js
pm2 save           # persist across reboots
```
Verify it's up: `curl -I http://localhost:3002/upload` should return 200.

### 4. nginx reverse proxy
Create `/etc/nginx/sites-available/library-search`:
```nginx
server {
    listen 80;
    server_name <your-domain>;

    location / {
        proxy_pass http://localhost:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        client_max_body_size 500M;   # large media uploads to R2 presign flow
    }
}
```
Then:
```bash
ln -s /etc/nginx/sites-available/library-search /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
# HTTPS:
certbot --nginx -d <your-domain>
```

---

## GitHub repo secrets (one-time)

The deploy workflow needs SSH access. Same droplet + key as thought-post, but secrets are
repo-scoped so they must be added to THIS repo too. From your machine:
```bash
# copy values from however thought-post's secrets were set
gh secret set DO_SSH_USER --repo Hite-Labs/library-search --body "root"
gh secret set DO_SSH_KEY  --repo Hite-Labs/library-search < /path/to/droplet_ssh_private_key
```

---

## Ongoing deploys

Just push to `main`. The workflow runs: `git pull` → `npm ci` → `npm run build` →
`pm2 reload`. Watch it under the repo's Actions tab.

## Useful droplet commands
```bash
pm2 status                 # see library-search process
pm2 logs library-search    # tail logs
pm2 reload library-search  # manual restart
```
