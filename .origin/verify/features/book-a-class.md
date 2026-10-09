# book-a-class

## What it is

Taking a spot in a class as the demo member, and being refused when the class is
full or you are already on it. There is no sign-in yet, so every booking is made
as `mbr_iris` on the server.

## How a user reaches it

The Book button on any timetable card (`/`). It `POST`s to `/api/book` and shows
a toast on success or on a refusal.

## How an agent drives it

`POST http://localhost:3000/api/book` with `content-type: application/json` and
body `{"sessionId":"ses_<day>_<index>"}` (see Drive in the recipe). The seeded
week gives every case:

- **success** — `ses_0_1` (Power Vinyasa, 1 of 20 taken; Iris is not on it):
  HTTP 200, `{"ok":true,"bookingId":"bkg_..."}`.
- **already booked** — `ses_0_0` (Iris is seeded on it): HTTP 409,
  `{"ok":false,"reason":"already_booked"}`.
- **bad request** — a body without `sessionId`, e.g. `{"nope":true}`: HTTP 400,
  `{"ok":false,"reason":"bad_request"}`.
- **full** — run `bun --env-file=.env.local run verify.ts` (see Drive): it forces
  `ses_2_1` to capacity 1 and fires six concurrent bookings; the losers get
  `reason:"full"`. After it runs, `POST /api/book` for `ses_2_1` also returns
  HTTP 409 `{"ok":false,"reason":"full"}` over HTTP.

These calls change the seeded database; `bun run db:seed` restores it.

## What proves it works

- **success**: after the `ses_0_1` POST, exactly one booking row exists for
  `session_id='ses_0_1'` and `member_id='mbr_iris'`, its `status` is `booked`,
  and its `id` equals the `bookingId` the response returned.
- **already booked**: the POST for `ses_0_0` returns 409 `already_booked`, and
  the number of booking rows for `(ses_0_0, mbr_iris)` stays at one.
- **bad request**: HTTP 400 `bad_request`, and no booking row is written.
- **full**: `verify.ts` exits 0 and prints `in db    : 1` — six concurrent
  attempts on a one-seat class leave exactly one booking row, so the class did
  not overbook and the other five were refused `full`.
