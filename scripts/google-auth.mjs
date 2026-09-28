// One-time: get a Google refresh token for the intake automation (CC-4), as Lindsay.
//
//     node scripts/google-auth.mjs
//
// Needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local — from a Google Cloud OAuth
// client of type "Desktop app", in an OAuth consent screen set to Internal (Lindsay's
// Workspace), with the Drive and Docs APIs enabled.
//
// It prints a URL. Open it signed in as LINDSAY (the files are created in whichever account
// approves), click Allow, and the refresh token is printed here. Put it in GOOGLE_REFRESH_TOKEN
// on the droplet. Nothing is written anywhere by this script.
//
// Scopes: full Drive (to copy the template doc, which the app didn't create — the narrower
// drive.file scope can't see it) and Docs (to fill in the placeholders).

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

function loadEnv() {
  try {
    for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
      const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  } catch {
    // Fall through to whatever is already in the environment.
  }
}
loadEnv();

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.local first.');
  process.exit(1);
}

const PORT = 53682;
const redirectUri = `http://127.0.0.1:${PORT}/callback`;
const scopes = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/documents',
];

const authUrl =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    // offline + consent: always return a refresh token, even if this account approved before.
    access_type: 'offline',
    prompt: 'consent',
  });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', redirectUri);
  if (url.pathname !== '/callback') {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end(`No code: ${url.searchParams.get('error') ?? 'unknown error'}`);
    server.close();
    return;
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const body = await tokenRes.json();
  if (!body.refresh_token) {
    res.writeHead(500).end('No refresh token returned — see the terminal.');
    console.error('\nToken exchange failed:', body);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Done. You can close this tab.');
    console.log('\nGOOGLE_REFRESH_TOKEN=' + body.refresh_token + '\n');
  }
  server.close();
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('\nOpen this URL signed in as Lindsay, and click Allow:\n');
  console.log(authUrl + '\n');
});
