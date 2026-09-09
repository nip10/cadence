import { z } from "zod";

import { bookClass } from "@/lib/bookings";

/** The single member every booking is made as, until there is auth. */
const DEMO_MEMBER = "mbr_iris";

const bodySchema = z.object({ sessionId: z.string().min(1) });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ ok: false, reason: "bad_request" }, { status: 400 });
  }

  const result = await bookClass(parsed.data.sessionId, DEMO_MEMBER);
  return Response.json(result, { status: result.ok ? 200 : 409 });
}
