import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { booking, classSession, classTemplate } from "@/db/schema";

/**
 * Booking a class.
 *
 * The capacity check runs inside a transaction that takes the session's row
 * lock first. Every booking for a session has to pass through that one lock,
 * so a second attempt cannot count seats until the first has committed and
 * its booking is visible — count and insert can no longer interleave.
 *
 * The lock lives on `class_session` rather than on the bookings, because the
 * session row is the thing everyone is contending for; a constraint on the
 * bookings could not express "at most N per session" without a counter table.
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
    // Serialise bookings for this session: concurrent attempts queue here
    // until the one ahead of them commits, so the count below is taken
    // against a seat count that cannot change under us.
    const [session] = await tx
      .select()
      .from(classSession)
      .where(eq(classSession.id, sessionId))
      .for("update");
    if (!session || session.status === "cancelled") {
      return { ok: false, reason: "cancelled" };
    }

    let limit = session.capacity;
    if (limit === null) {
      const [template] = await tx
        .select({ capacity: classTemplate.capacity })
        .from(classTemplate)
        .where(eq(classTemplate.id, session.templateId));
      if (!template) {
        return { ok: false, reason: "cancelled" };
      }
      limit = template.capacity;
    }

    const rows = await tx
      .select({ memberId: booking.memberId, status: booking.status })
      .from(booking)
      .where(eq(booking.sessionId, sessionId));

    const mine = rows.find(
      (row) => row.memberId === memberId && row.status !== "cancelled"
    );
    if (mine) {
      return { ok: false, reason: "already_booked" };
    }

    const taken = rows.filter((row) => row.status !== "cancelled").length;
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
