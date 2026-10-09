# timetable

## What it is

The week's class timetable: every upcoming class, grouped by day, each card
showing its time, class name, description, instructor, duration, how much space
is left, and a Book button. Classes open two weeks ahead.

## How a user reaches it

Open `/` in a browser. It is the app's only page, and every booking starts here
via the Book button on a card (`book-a-class`).

## How an agent drives it

`GET http://localhost:3000/` (see Drive in the recipe). The page is
server-rendered, so the timetable is in the HTML; React separates adjacent text
nodes with `<!-- -->` comments.

## What proves it works

`GET /` returns 200, its HTML contains `This week at the studio`, and it does not
contain `No classes on the timetable` — that is, the seeded week rendered rather
than the empty state. The seeded first Reformer Pilates class (`ses_1_2`, 7 of 8
taken) shows exactly `1<!-- --> of <!-- -->8<!-- --> left` and carries a Book
button; a class at capacity shows a destructive `Full` badge instead of a count.
