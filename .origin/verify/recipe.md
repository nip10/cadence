# Verifying Cadence

How to launch Cadence, check it is ready, drive it and stop it. Paste each block
from the repository root. `.origin/verify/features/` has one file per feature:
this file is *how* to drive, those are *what* to drive and *what proves it*.

## Launch

Cadence is a Next.js app on :3000 against a local Postgres on :5433. Start the
database, write the env file the app reads, apply the schema, seed a week of
timetable, then start the app in the background.

```bash
bun install
bun run db:start          # Postgres 18; publishes CADENCE_DB_PORT (default 5433)

# The app reads DATABASE_URL from .env.local, and Next loads .env.local by itself.
# The db scripts read it too (`bun --env-file=.env.local`), so this one copy is
# all any of them need.
cp .env.example .env.local

# `push` asks for a TTY confirmation an agent shell will not have, so pass
# `--force` through the script. The script itself stays interactive, so a
# human's `bun run db:push` still gets the confirmation before it changes data.
bun run db:push -- --force
bun run db:seed           # 21 sessions over 7 days; the first Reformer class is 7 of 8

# Start the app detached, logging to a file.
nohup bun run dev > /tmp/cadence-dev.log 2>&1 &
```

Postgres is accepting connections within a few seconds. `next dev` prints `Ready`
in about 2 seconds and compiles the first request in about 1.5 seconds more, so
give the app 15 seconds before the Doctor.

`db:start` publishes host port **`CADENCE_DB_PORT`** (default 5433), so nothing
else may already be holding it. If something is, set `CADENCE_DB_PORT` to a free
port and set the port in `DATABASE_URL` to match.

## Doctor

One command; exits 0 only when the app is up and serving the seeded timetable.

```bash
curl -fsS -o /dev/null -w '%{http_code}\n' http://localhost:3000/ | grep -qx 200 \
  && curl -fsS http://localhost:3000/ | grep -q 'This week at the studio' \
  && ! curl -fsS http://localhost:3000/ | grep -q 'No classes on the timetable'
```

The timetable page is server-rendered from Postgres, so a 200 that contains
classes (rather than the "No classes" empty state) means both the app and its
database are ready. Do not drive until this passes.

## Drive

Base URL `http://localhost:3000`. There is no auth: every booking is made as
`mbr_iris` on the server.

- `GET /` — the timetable HTML, server-rendered. React separates adjacent text
  nodes with `<!-- -->` comments, so a badge reads
  `1<!-- --> of <!-- -->8<!-- --> left`.
- `POST /api/book` — JSON body `{"sessionId":"ses_<day>_<index>"}` with header
  `content-type: application/json`. Session ids are `ses_<day>_<index>` with
  `day` 0–6 and `index` 0–2 (07:00, 12:15, 18:30). The response is:
  - `200 {"ok":true,"bookingId":"bkg_..."}`
  - `409 {"ok":false,"reason":"full" | "already_booked" | "cancelled"}`
  - `400 {"ok":false,"reason":"bad_request"}` when the body is not `{sessionId}`.
- For concurrency, `bun --env-file=.env.local run verify.ts` drives `bookClass`
  directly against Postgres (it does not go through HTTP): it forces `ses_2_1` to
  capacity 1, fires six concurrent bookings, and exits non-zero unless exactly
  one row lands.

Driving bookings changes the seeded database. `bun run db:seed` restores it.

## Evidence

Keep observations in `$HOME/.origin/artifacts/` (Origin collects them beside the
diff). Keep, per feature: the exact request you sent, the raw response (status
and body), and the row you read back from Postgres. The HTTP status alone is not
evidence that a booking happened — the row is.

```bash
mkdir -p "$HOME/.origin/artifacts"
curl -fsS http://localhost:3000/ -o "$HOME/.origin/artifacts/timetable.html"
curl -s -X POST http://localhost:3000/api/book -H 'content-type: application/json' \
  -d '{"sessionId":"ses_0_1"}' -w '\nHTTP %{http_code}\n' \
  | tee "$HOME/.origin/artifacts/book-success.json"
bun --env-file=.env.local run verify.ts 2>&1 | tee "$HOME/.origin/artifacts/verify.log"
```

Read a booking row back:

```bash
bun --env-file=.env.local -e "$(cat <<'TS'
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const rows = await sql`select id, session_id, member_id, status from booking
  where session_id = 'ses_0_1' and member_id = 'mbr_iris'`;
console.log(JSON.stringify(rows));
await sql.end();
TS
)" | tee "$HOME/.origin/artifacts/book-row.json"
```

## Cleanup

Stop exactly what Launch started — the dev server and the database container —
and nothing else.

```bash
pkill -f "$PWD/node_modules/.bin/next dev"   # the app Launch started
bun run db:stop                              # the database Launch started
```
