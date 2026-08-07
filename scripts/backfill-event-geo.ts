/**
 * One-off backfill: stamp address/lat/lng on existing engine-curated events
 * from the area registry. Safe to re-run (only touches rows with NULL address).
 */
import mysql from "mysql2/promise";
import { AREAS, venueGeo } from "../api/lib/eventEngine/locations";

async function main() {
  const url = new URL(process.env.DATABASE_URL!);
  const c = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 4000),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { minVersion: "TLSv1.2" },
  });
  let updated = 0;
  for (const area of AREAS) {
    for (const venue of area.venues) {
      const geo = venueGeo(area, venue.name);
      const [res] = await c.query(
        `UPDATE events SET address = ?, lat = ?, lng = ?
         WHERE city = ? AND venue = ? AND hostName LIKE 'Resonance Events ·%' AND address IS NULL`,
        [venue.address, geo.lat, geo.lng, area.name, venue.name],
      );
      updated += (res as mysql.ResultSetHeader).affectedRows;
    }
  }
  const [rows] = await c.query(
    `SELECT COUNT(*) AS total,
            SUM(address IS NOT NULL) AS withAddress,
            SUM(lat IS NOT NULL) AS withGeo
     FROM events WHERE hostName LIKE 'Resonance Events ·%'`,
  );
  console.log("updated:", updated, JSON.stringify(rows));
  await c.end();
}

main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
