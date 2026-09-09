import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { booking, classSession } from "@/db/schema";

/**
 * Booking a class.
 *
 * ⚠️ The capacity check here is **knowingly racy**, and left that way on
 * purpose. It counts, then inserts, with nothing between the two — so two
 * people booking the last spot at the same moment both see space and both get
 * in. This is the most common way this feature is written, it passes every
 * single-user test, and it fails exactly once the studio gets popular.
 *
 * It is the first real task in the README: fix the overbooking race. Doing it
 * properly needs a decision about *how* — a transaction with a row lock, or a
 * database constraint — which is the kind of decision worth a human seeing.
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
  const capacity = await capacityFor(sessionId);
  if (!capacity) {
    return { ok: false, reason: "cancelled" };
  }
  if (capacity.session.status === "cancelled") {
    return { ok: false, reason: "cancelled" };
  }

  const mine = capacity.session.bookings.find(
    (row) => row.memberId === memberId && row.status !== "cancelled"
  );
  if (mine) {
    return { ok: false, reason: "already_booked" };
  }

  // Here is the race. Nothing holds the count still while we insert.
  if (capacity.remaining <= 0) {
    return { ok: false, reason: "full" };
  }

  const id = newId("bkg");
  await db
    .insert(booking)
    .values({ id, memberId, sessionId, status: "booked" })
    .onConflictDoUpdate({
      set: { cancelledAt: null, status: "booked" },
      target: [booking.sessionId, booking.memberId],
    });

  return { bookingId: id, ok: true };
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
