/**
 * One-off backfill: stamp address/lat/lng on existing engine-curated events
 * from the area registry. Safe to re-run (only touches rows with NULL address).
 */
import "dotenv/config";
import postgres from "postgres";
import { AREAS, venueGeo } from "../api/lib/eventEngine/locations";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  let updated = 0;
  for (const area of AREAS) {
    for (const venue of area.venues) {
      const geo = venueGeo(area, venue.name);
      const res = await sql`
        UPDATE events SET address = ${venue.address}, lat = ${geo.lat}, lng = ${geo.lng}
        WHERE city = ${area.name} AND venue = ${venue.name}
          AND "hostName" LIKE 'Resonance Events ·%' AND address IS NULL
      `;
      updated += res.count;
    }
  }
  const rows = await sql`
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE address IS NOT NULL) AS "withAddress",
           COUNT(*) FILTER (WHERE lat IS NOT NULL) AS "withGeo"
    FROM events WHERE "hostName" LIKE 'Resonance Events ·%'
  `;
  console.log("updated:", updated, JSON.stringify(rows));
  await sql.end();
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
