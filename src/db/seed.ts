import { sql } from "drizzle-orm";

import { db } from "./index";
import {
  booking,
  classSession,
  classTemplate,
  instructor,
  member,
} from "./schema";

/**
 * A week of timetable, and enough bookings that at least one class is nearly
 * full — which is where the interesting behaviour lives.
 */

const log = (message: string) => process.stdout.write(`${message}\n`);

const instructors = [
  { bio: "Fifteen years of vinyasa. Will notice your shoulders.", id: "ins_maya", name: "Maya Ferreira" },
  { bio: "Ex-track. Runs the conditioning classes hard and on time.", id: "ins_theo", name: "Theo Bright" },
  { bio: "Reformer specialist, rehab background.", id: "ins_kay", name: "Kay Osei" },
];

const templates = [
  { capacity: 16, description: "Slow, breath-led, floor-heavy. Bring socks.", durationMinutes: 60, id: "tpl_restore", instructorId: "ins_maya", name: "Restorative Flow" },
  { capacity: 20, description: "Continuous movement. Not for a first class.", durationMinutes: 45, id: "tpl_power", instructorId: "ins_maya", name: "Power Vinyasa" },
  { capacity: 12, description: "Intervals on the rower and the sled.", durationMinutes: 50, id: "tpl_condition", instructorId: "ins_theo", name: "Conditioning" },
  { capacity: 8, description: "Reformer, eight beds, book early.", durationMinutes: 55, id: "tpl_reformer", instructorId: "ins_kay", name: "Reformer Pilates" },
  { capacity: 24, description: "Free for members. Mats provided.", durationMinutes: 30, id: "tpl_mobility", instructorId: "ins_kay", name: "Lunchtime Mobility" },
];

const members = [
  { email: "iris@example.com", id: "mbr_iris", name: "Iris Kelly" },
  { email: "sam@example.com", id: "mbr_sam", name: "Sam Adeyemi" },
  { email: "noor@example.com", id: "mbr_noor", name: "Noor Haddad" },
  { email: "leo@example.com", id: "mbr_leo", name: "Leo Marsh" },
  { email: "ada@example.com", id: "mbr_ada", name: "Ada Nowak" },
  { email: "ben@example.com", id: "mbr_ben", name: "Ben Ortiz" },
  { email: "cleo@example.com", id: "mbr_cleo", name: "Cleo Vance" },
  { email: "dev@example.com", id: "mbr_dev", name: "Dev Raman" },
];

/** 07:00, 12:15 and 18:30, the three slots a real studio actually sells. */
const SLOTS = [
  { hour: 7, minute: 0 },
  { hour: 12, minute: 15 },
  { hour: 18, minute: 30 },
];

function buildSessions() {
  const sessions: (typeof classSession.$inferInsert)[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  for (let day = 0; day < 7; day += 1) {
    for (const [index, slot] of SLOTS.entries()) {
      const template = templates[(day + index) % templates.length];
      if (!template) {
        continue;
      }
      const startsAt = new Date(start);
      startsAt.setDate(start.getDate() + day);
      startsAt.setHours(slot.hour, slot.minute, 0, 0);

      sessions.push({
        id: `ses_${day}_${index}`,
        startsAt,
        templateId: template.id,
      });
    }
  }
  return sessions;
}

/** Fills the first Reformer class to one spot short of capacity. */
function buildBookings(sessions: (typeof classSession.$inferInsert)[]) {
  const rows: (typeof booking.$inferInsert)[] = [];
  const reformer = sessions.find((row) => row.templateId === "tpl_reformer");

  /*
   * Everyone except the demo member, so clicking Book on the timetable
   * actually takes the last spot rather than reporting you are already on it.
   */
  if (reformer) {
    for (const [index, entry] of members.slice(1, 8).entries()) {
      rows.push({
        id: `bkg_reformer_${index}`,
        memberId: entry.id,
        sessionId: reformer.id as string,
        status: "booked",
      });
    }
  }

  // A scattering elsewhere so the timetable does not look empty.
  for (const [index, session] of sessions.slice(0, 9).entries()) {
    if (session.templateId === "tpl_reformer") {
      continue;
    }
    const entry = members[index % members.length];
    if (!entry) {
      continue;
    }
    rows.push({
      id: `bkg_spread_${index}`,
      memberId: entry.id,
      sessionId: session.id as string,
      status: "booked",
    });
  }

  return rows;
}

async function run() {
  log("Resetting…");
  await db.execute(
    sql`TRUNCATE TABLE ${booking}, ${classSession}, ${classTemplate}, ${member}, ${instructor} RESTART IDENTITY CASCADE`
  );

  log(`Inserting ${instructors.length} instructors…`);
  await db.insert(instructor).values(instructors);

  log(`Inserting ${templates.length} class templates…`);
  await db.insert(classTemplate).values(templates);

  log(`Inserting ${members.length} members…`);
  await db.insert(member).values(members);

  const sessions = buildSessions();
  log(`Inserting ${sessions.length} sessions across the next 7 days…`);
  await db.insert(classSession).values(sessions);

  const bookings = buildBookings(sessions);
  log(`Inserting ${bookings.length} bookings…`);
  await db.insert(booking).values(bookings);

  log("\nSeeded. Reformer Pilates is at 7 of 8 — one spot left, because that");
  log("is where the interesting behaviour is.");
  process.exit(0);
}

run().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exit(1);
});
