import postgres from "postgres";
import { bookClass } from "@/lib/bookings";

const sql = postgres(process.env.DATABASE_URL!, { prepare: false });
const SESSION = "ses_2_1";

await sql`delete from booking where session_id = ${SESSION}`;
await sql`update class_session set capacity = 1 where id = ${SESSION}`;

const [before] = await sql`
  select coalesce(s.capacity, t.capacity) as cap,
         (select count(*) from booking b where b.session_id = s.id and b.status <> 'cancelled') as taken
  from class_session s join class_template t on t.id = s.template_id where s.id = ${SESSION}`;
console.log(`setup    : capacity ${before.cap}, ${before.taken} booked`);

const members = ["mbr_sam","mbr_noor","mbr_leo","mbr_ada","mbr_ben","mbr_cleo"];
const results = await Promise.all(members.map((m) => bookClass(SESSION, m)));
console.log(`attempts : ${members.length}`);
console.log(`accepted : ${results.filter((r) => r.ok).length}`);
console.log(`rejected : ${results.filter((r) => !r.ok).map((r: any) => r.reason).join(", ") || "none"}`);

const [after] = await sql`select count(*)::int as n from booking where session_id = ${SESSION} and status <> 'cancelled'`;
console.log(`in db    : ${after.n}`);
console.log(after.n === 1 ? "\nPASS — one spot, one booking." : `\nFAIL — capacity 1 holds ${after.n} bookings.`);
await sql.end();
process.exit(0);
