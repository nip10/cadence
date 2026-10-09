# Cadence

Class booking for a small studio. Next.js, Drizzle, Postgres, shadcn/ui.

> This app exists to be **worked on**. It is the target for an agent pipeline —
> a real repo, with real migrations and a real deploy, so that "an agent shipped
> a feature and a human approved the risky part" is something you can watch
> rather than something you're told.
>
> It is therefore deliberately unfinished, and the one part that was
> deliberately broken — the overbooking race — is documented below alongside
> its fix.

## Running it

```bash
bun install
bun run db:start          # Postgres 18; publishes CADENCE_DB_PORT (default 5433)
cp .env.example .env.local
bun run db:push           # asks before it changes anything; add `-- --force` to skip
bun run db:seed
bun run dev               # http://localhost:3000
```

`db:start` publishes `CADENCE_DB_PORT`, defaulting to 5433. If that port is
already taken, set `CADENCE_DB_PORT` to a free one and set the same port in
`DATABASE_URL` in `.env.local`. Every `db:` script reads `.env.local`.

The seed builds a week of timetable across three slots a real studio sells —
07:00, 12:15 and 18:30 — and leaves **Reformer Pilates at 7 of 8**, because
that is where the interesting behaviour is.

## The model

| Table | What it is |
| --- | --- |
| `instructor` | who teaches |
| `class_template` | a class as it appears on the timetable, before it has a date |
| `class_session` | one class, at one time, that people can book |
| `member` | who books |
| `booking` | a member on a session, with a status |

`class_session.capacity` is nullable and falls back to the template's, because a
studio moves one class into a smaller room without redefining the class.

## The overbooking race, fixed

The first task here: `src/lib/bookings.ts` used to count bookings and then
insert, with nothing in between, so two people going for the last spot both
saw space and both got in. It is the most common way this feature gets
written, it passes every single-user test, and it fails the moment the studio
gets popular. Measured, on a session with capacity forced to 1:

```
capacity 1 · concurrent attempts: 6
accepted : 6
rejected : none
```

Six people in a one-person class. Fixing it needed a *decision* — a
transaction with `SELECT … FOR UPDATE`, or a database constraint that makes
overbooking impossible — and that decision is worth a person seeing, which is
the point. The decision made: the transaction. `bookClass` now takes
`SELECT … FOR UPDATE` on the session's own row before it reads anything, so
concurrent bookings for one class queue behind each other, and each one counts
against a state that cannot move until it commits. No migration was needed;
under the same worst-case interleaving that used to land two bookings in a
one-seat class, the second attempt now gets `full`.

The trade: the guarantee holds for writers that go through `bookClass`, not
for every possible writer — the constraint route would have closed that too,
at the cost of a migration. The one thing the schema *does* enforce on its own
is `booking_member_session_idx`: nobody can book the same class twice,
whatever the race.

## What is missing, on purpose

Each of these is a different *kind* of change, which is why they were left out.

| Task | Why it is interesting |
| --- | --- |
| **Waitlists** | schema migration plus non-trivial promotion logic when someone cancels |
| **A cancellation window** | pure business rule, no schema change — the boring, safe kind |
| **Class packs / credits** | migration, and it touches money |
| **Real auth** | every booking is currently made as `mbr_iris` |
| **Admin: edit the timetable** | CRUD, and the first thing with a design surface worth reviewing |
| **Bump a dependency** | the change that looks safest and historically is not |

## Deploying

Vercel, with Supabase for Postgres. Set `DATABASE_URL` to the Supabase
**connection pooling** URI — the client sets `prepare: false`, which is what
that pooler needs.

Preview deploys per branch are the durable review surface: one immutable URL per
commit, which outlives the machine the work was done on.

## Scripts

```
bun run dev          bun run build        bun run start
bun run db:start     bun run db:stop      bun run db:push
bun run db:generate  bun run db:migrate   bun run db:seed
```
