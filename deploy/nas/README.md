# ASUSTOR AS5202T production deployment

This configuration targets Docker Engine on `linux/amd64`. It publishes web on
port 3100, admin on 3101, and API on 3400. MySQL is reachable only on the
Compose backend network and persists in the `mysql_data` named volume.

Run all commands from the repository root:

```sh
cd /volume1/home/tiggerbai/docker/havoice-commerce-ce/app
```

The commands below pass the environment file explicitly so they behave the same
regardless of the Compose CLI's project-directory rules.

## First deployment

```sh
git pull
cp deploy/nas/.env.example deploy/nas/.env
```

Edit `deploy/nas/.env`, replace every `CHANGE_ME` value, and replace the example
LAN IP in all browser-facing URLs. `DATABASE_URL` must keep `mysql` as its host;
`PUBLIC_API_URL` must use the NAS LAN IP or LAN DNS name, never `api`.

```sh
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml config
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml build
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml up -d mysql
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml run --rm migrate
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml --profile manual run --rm seed
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml up -d api web admin
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml ps
curl --fail http://NAS-IP:3400/api/health
```

Then open `http://NAS-IP:3100` and `http://NAS-IP:3101` on the LAN.

The seed service has the `manual` profile, so an ordinary `docker compose up`
does not run it. Run the seed command only for the intentional first/demo data
load.

## Later updates

```sh
git pull
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml build
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml run --rm migrate
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml up -d
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml ps
curl --fail http://NAS-IP:3400/api/health
```

Do not run seed during routine updates or container restarts.

## Maintenance

```sh
# Follow all logs, or append a service name such as api/mysql/web/admin
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml logs -f --tail=200

docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml ps
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml restart api web admin
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml stop
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml down

# Image/container/volume disk usage (read-only report)
docker system df
```

`down` preserves the named MySQL volume. Never add `--volumes` unless you
deliberately intend to delete the database.

### Back up MySQL

Create the destination directory first and protect the dump as a secret:

```sh
mkdir -p deploy/nas/backups
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml exec -T mysql sh -c 'exec mysqldump --single-transaction --routines --triggers -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' > deploy/nas/backups/havoice-YYYYMMDD.sql
chmod 600 deploy/nas/backups/havoice-YYYYMMDD.sql
```

### Restore MySQL

Restoring overwrites/conflicts with data in the selected database. Stop the app
services, verify the dump path and target database, and keep a fresh backup first.

```sh
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml stop api web admin
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml exec -T mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE"' < deploy/nas/backups/havoice-YYYYMMDD.sql
docker compose --env-file deploy/nas/.env -f deploy/nas/compose.yaml up -d api web admin
```

## URL and environment model

- Docker internal: `DATABASE_URL` uses `mysql:3306`; server-side Next requests use
  `INTERNAL_API_URL=http://api:4000` supplied by Compose.
- LAN/browser: `PUBLIC_API_URL`, `WEB_NEXTAUTH_URL`, `ADMIN_NEXTAUTH_URL`, and
  `CORS_ORIGIN` use the NAS IP/DNS name and published ports.
- `NEXT_PUBLIC_*` values are embedded during `docker compose build`. If a NAS IP
  or public URL changes, update `.env` and rebuild web/admin; restarting alone is
  insufficient.
- Secrets and provider credentials are runtime-only values. Optional SMTP,
  Cloudinary, and ECPay values become required when those features are enabled.

## Safety notes

- MySQL port 3306 is deliberately not published to the NAS host.
- Never commit `deploy/nas/.env`, dumps, or real credentials.
- Do not expose the admin service directly to the internet. This first-stage
  setup has no TLS or reverse proxy.
- Do not seed on production restarts or ordinary updates.
- Do not use `docker system prune -a`; it can remove images needed for rollback.
- Back up MySQL before migrations and before any restore operation.
