# Crypto Win — Backend TRON + Postgres + Cron configurables

## Novedades
1) **Seguridad y validaciones**: rate limit en login, hash de contraseña, base para verificación.
2) **Persistencia real**: Postgres (scripts de migración incluidos).
3) **Automatización de retiros**: cron configurable (día/hora) y batch con límites.
4) **Auditoría y exportables**: registro de acciones admin + export CSV.
5) **Hardening TRON**: verificación de saldos USDT/TRX, límite por lote, idempotencia simple.

## Uso
```bash
npm install
npm run migrate
cp .env.example .env   # edita conexión a Postgres y TRON_PK
npm start
```

## Endpoints útiles
- `POST /admin/cron/apply` { expr: "0 10 * * 1" }
- `GET /admin/export/users.csv`
- `GET /admin/export/withdrawals.csv`
- `GET /admin/audit?limit=100`
