# Deploying to Digital Ocean

## Option A — Docker on a Droplet (recommended)

### 1. Provision a Droplet
- Ubuntu 22.04 LTS, min 2 GB RAM (4 GB for 500 users)
- Enable the Docker 1-Click App or install manually:
  ```
  curl -fsSL https://get.docker.com | sh
  ```

### 2. Clone the repository
```bash
git clone https://github.com/YOUR_ORG/YOUR_REPO.git
cd YOUR_REPO/FinalManifestion1
```

### 3. Configure environment
```bash
cp .env.example .env
nano .env          # fill in DATABASE_URL, POSTGRES_PASSWORD, CORS_ORIGIN
```

### 4. Launch
```bash
docker compose up -d --build
```

The app will be available on port **3000**. Put Nginx or Caddy in front for HTTPS.

---

## Option B — Digital Ocean App Platform

1. Push this repo to GitHub.
2. In DO App Platform, create a new App → connect your GitHub repo.
3. Set the **Source Directory** to `FinalManifestion1`.
4. Add a **Managed PostgreSQL** database component and link it — DO will inject `DATABASE_URL` automatically.
5. Set the **Run Command** to:
   ```
   node --enable-source-maps api-server/dist/index.mjs
   ```
6. Set the **Build Command** to:
   ```
   npm install -g pnpm@10 && pnpm install --frozen-lockfile && pnpm --filter @workspace/church-portal build && pnpm --filter @workspace/api-server build
   ```
7. Set env vars: `PORT=8080`, `NODE_ENV=production`.
8. Deploy.

---

## Database migration (first run)

The app auto-creates all tables on startup via Drizzle. No manual migration needed.

If using docker-compose, the included PostgreSQL service is created automatically.
For production, a Managed Database (DO, AWS RDS, Supabase) is strongly recommended.

---

## Nginx reverse proxy (optional, for HTTPS on Droplet)

```nginx
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    client_max_body_size 20M;

    location / {
        proxy_pass         http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 60s;
    }
}
```

Get a free SSL cert: `sudo certbot --nginx -d yourdomain.com`
