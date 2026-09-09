import { asc, gte } from "drizzle-orm";

import { BookButton } from "@/components/book-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db";
import { classSession } from "@/db/schema";

/** The timetable. Everything a member does starts here. */
export const dynamic = "force-dynamic";

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  weekday: "long",
});
const TIME = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
});

export default async function SchedulePage() {
  const sessions = await db.query.classSession.findMany({
    orderBy: [asc(classSession.startsAt)],
    where: gte(classSession.startsAt, new Date()),
    with: {
      bookings: true,
      template: { with: { instructor: true } },
    },
  });

  const byDay = new Map<string, typeof sessions>();
  for (const session of sessions) {
    const key = DAY.format(session.startsAt);
    byDay.set(key, [...(byDay.get(key) ?? []), session]);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="mb-10">
        <h1 className="text-3xl font-semibold tracking-tight">Cadence</h1>
        <p className="mt-1 text-muted-foreground">
          This week at the studio. Classes open two weeks ahead.
        </p>
      </header>

      <div className="space-y-8">
        {[...byDay.entries()].map(([day, entries]) => (
          <section key={day}>
            <h2 className="mb-3 text-sm font-medium text-muted-foreground">
              {day}
            </h2>
            <div className="space-y-2">
              {entries.map((session) => {
                const limit = session.capacity ?? session.template.capacity;
                const taken = session.bookings.filter(
                  (row) => row.status !== "cancelled"
                ).length;
                const remaining = limit - taken;

                return (
                  <Card key={session.id}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="font-mono text-sm tabular-nums text-muted-foreground">
                          {TIME.format(session.startsAt)}
                        </span>
                        <CardTitle className="text-base">
                          {session.template.name}
                        </CardTitle>
                        {remaining <= 0 ? (
                          <Badge variant="destructive">Full</Badge>
                        ) : (
                          <Badge variant="secondary">
                            {remaining} of {limit} left
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-wrap items-end justify-between gap-4 pt-0">
                      <div className="max-w-lg">
                        <p className="text-sm">{session.template.description}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {session.template.instructor?.name ?? "TBC"} ·{" "}
                          {session.template.durationMinutes} min
                        </p>
                      </div>
                      <BookButton
                        full={remaining <= 0}
                        sessionId={session.id}
                      />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        ))}

        {sessions.length === 0 ? (
          <p className="text-muted-foreground">
            No classes on the timetable. Run <code>bun run db:seed</code>.
          </p>
        ) : null}
      </div>
    </main>
  );
}
