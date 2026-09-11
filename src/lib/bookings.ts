import { and, count, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { booking, classSession, classTemplate } from "@/db/schema";

/**
 * Booking a class.
 *
 * The capacity check and the insert happen inside one transaction, and the
 * session row is locked `FOR UPDATE` before anything is counted. Two people
 * going for the last spot therefore queue on that row: the second one waits
 * for the first to commit, then re-counts and sees a full class. The old
 * version counted, then inserted, with nothing holding the count still in
 * between — so both bookings could land.
 */

export type BookResult =
  | { reason: "cancelled" | "full" | "already_booked"; ok: false }
  | { bookingId: string; ok: true };

const newId = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().slice(0, 12)}`;

export async function capacityFor(sessionId: string) {
  const session = await db.query.classSession.findFirst({
    where: eq(classSession.id, sessionId),
    with: { bookings: true, template: true },
  });
  if (!session) {
    return null;
  }

  const limit = session.capacity ?? session.template.capacity;
  const taken = session.bookings.filter((row) => row.status !== "cancelled")
    .length;

  return { limit, remaining: limit - taken, session, taken };
}

export async function bookClass(
  sessionId: string,
  memberId: string
): Promise<BookResult> {
  return db.transaction(async (tx): Promise<BookResult> => {
    // The lock is the fix: concurrent bookings for this class queue on the
    // session row, so the count below is taken only after earlier inserts
    // have committed. `of` keeps the lock on the session row alone.
    const [session] = await tx
      .select({
        status: classSession.status,
        capacity: classSession.capacity,
        templateCapacity: classTemplate.capacity,
      })
      .from(classSession)
      .innerJoin(classTemplate, eq(classSession.templateId, classTemplate.id))
      .where(eq(classSession.id, sessionId))
      .for("update", { of: classSession });

    if (!session) {
      return { ok: false, reason: "cancelled" };
    }
    if (session.status === "cancelled") {
      return { ok: false, reason: "cancelled" };
    }

    const mine = await tx
      .select({ id: booking.id })
      .from(booking)
      .where(
        and(
          eq(booking.sessionId, sessionId),
          eq(booking.memberId, memberId),
          ne(booking.status, "cancelled")
        )
      )
      .limit(1);
    if (mine.length > 0) {
      return { ok: false, reason: "already_booked" };
    }

    const limit = session.capacity ?? session.templateCapacity;
    const [{ taken }] = await tx
      .select({ taken: count() })
      .from(booking)
      .where(
        and(eq(booking.sessionId, sessionId), ne(booking.status, "cancelled"))
      );
    if (taken >= limit) {
      return { ok: false, reason: "full" };
    }

    const id = newId("bkg");
    await tx
      .insert(booking)
      .values({ id, memberId, sessionId, status: "booked" })
      .onConflictDoUpdate({
        set: { cancelledAt: null, status: "booked" },
        target: [booking.sessionId, booking.memberId],
      });

    return { bookingId: id, ok: true };
  });
}

/**
 * Cancelling a booking.
 *
 * Note what does *not* happen here: nothing checks how close the class is, and
 * nothing offers the spot to anyone else. Both are README tasks.
 */
export async function cancelBooking(sessionId: string, memberId: string) {
  await db
    .update(booking)
    .set({ cancelledAt: new Date(), status: "cancelled" })
    .where(
      and(eq(booking.sessionId, sessionId), eq(booking.memberId, memberId))
    );
  return { ok: true };
}
