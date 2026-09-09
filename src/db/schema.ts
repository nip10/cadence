import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Cadence — class booking for a small studio.
 *
 * The schema is deliberately incomplete. Three things a real studio needs are
 * missing on purpose, because each one is a different *kind* of change for an
 * agent to make, and the point of this repo is to be worked on:
 *
 *   waitlists            — needs a migration and non-trivial logic
 *   a cancellation window — pure business rule, no schema change
 *   class packs / credits — needs a migration and touches money
 *
 * See README for the task list.
 */

export const bookingStatusEnum = pgEnum("booking_status", [
  "booked",
  "cancelled",
  "attended",
  "no_show",
]);

export const sessionStatusEnum = pgEnum("session_status", [
  "scheduled",
  "cancelled",
]);

export const instructor = pgTable("instructor", {
  bio: text("bio").notNull().default(""),
  id: text("id").primaryKey(),
  name: text("name").notNull(),
});

/** A class as it appears on the timetable, before it has a date. */
export const classTemplate = pgTable("class_template", {
  /** How many people fit. A session may override it. */
  capacity: integer("capacity").notNull().default(12),
  description: text("description").notNull().default(""),
  durationMinutes: integer("duration_minutes").notNull().default(60),
  id: text("id").primaryKey(),
  instructorId: text("instructor_id").references(() => instructor.id, {
    onDelete: "set null",
  }),
  name: text("name").notNull(),
});

/** One class, at one time, that people can actually book. */
export const classSession = pgTable(
  "class_session",
  {
    /** Null means inherit the template's capacity. */
    capacity: integer("capacity"),
    id: text("id").primaryKey(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    status: sessionStatusEnum("status").notNull().default("scheduled"),
    templateId: text("template_id")
      .notNull()
      .references(() => classTemplate.id, { onDelete: "cascade" }),
  },
  (table) => [index("class_session_starts_at_idx").on(table.startsAt)]
);

export const member = pgTable("member", {
  email: text("email").notNull().unique(),
  id: text("id").primaryKey(),
  joinedAt: timestamp("joined_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  name: text("name").notNull(),
});

export const booking = pgTable(
  "booking",
  {
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey(),
    memberId: text("member_id")
      .notNull()
      .references(() => member.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => classSession.id, { onDelete: "cascade" }),
    status: bookingStatusEnum("status").notNull().default("booked"),
  },
  (table) => [
    /* One person cannot book the same class twice. This one *is* enforced. */
    uniqueIndex("booking_member_session_idx").on(
      table.sessionId,
      table.memberId
    ),
    index("booking_session_idx").on(table.sessionId),
  ]
);

export const instructorRelations = relations(instructor, ({ many }) => ({
  templates: many(classTemplate),
}));

export const classTemplateRelations = relations(
  classTemplate,
  ({ one, many }) => ({
    instructor: one(instructor, {
      fields: [classTemplate.instructorId],
      references: [instructor.id],
    }),
    sessions: many(classSession),
  })
);

export const classSessionRelations = relations(
  classSession,
  ({ one, many }) => ({
    bookings: many(booking),
    template: one(classTemplate, {
      fields: [classSession.templateId],
      references: [classTemplate.id],
    }),
  })
);

export const memberRelations = relations(member, ({ many }) => ({
  bookings: many(booking),
}));

export const bookingRelations = relations(booking, ({ one }) => ({
  member: one(member, {
    fields: [booking.memberId],
    references: [member.id],
  }),
  session: one(classSession, {
    fields: [booking.sessionId],
    references: [classSession.id],
  }),
}));
