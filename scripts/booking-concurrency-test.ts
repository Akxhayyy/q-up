/**
 * Fires N students at one slot with capacity K and asserts exactly K
 * bookings succeed and the rest get a clean 409 "This slot is full" — the
 * live proof that slot capacity (a single atomic UPDATE ... RETURNING, same
 * trick as token issuance) can't be overbooked under concurrent load.
 * Requires the dev/prod server running, and a real slot id — pass it via
 * SLOT_ID or the script creates one against a STAFF-logged-in session.
 */
export {}; // isolate this script's scope (see scripts/concurrency-test.ts)

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const COUNT = Number(process.env.COUNT ?? 25);
const CAPACITY = Number(process.env.CAPACITY ?? 5);

async function main() {
  const slotId = process.env.SLOT_ID;
  if (!slotId) {
    console.error("Set SLOT_ID to an existing slot id (staff-created) before running this script.");
    process.exit(1);
  }

  console.log(`Firing ${COUNT} parallel bookings at slot ${slotId} (capacity ${CAPACITY} expected) ...`);

  const results = await Promise.all(
    Array.from({ length: COUNT }, (_, i) =>
      fetch(`${BASE_URL}/api/slots/${slotId}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holderName: `Concurrency Test ${i}`,
          studentId: `BOOKCONC-${Date.now()}-${i}`,
        }),
      }).then(async (res) => ({ status: res.status, body: await res.json() }))
    )
  );

  const succeeded = results.filter((r) => r.status === 201);
  const full = results.filter((r) => r.status === 409);
  const other = results.filter((r) => r.status !== 201 && r.status !== 409);

  console.log(`Succeeded (201): ${succeeded.length}/${COUNT}`);
  console.log(`Full (409):      ${full.length}/${COUNT}`);
  console.log(`Other:           ${other.length}/${COUNT}`);

  const capacityRespected = succeeded.length === CAPACITY;
  console.log(
    `Capacity respected: ${capacityRespected ? "PASS" : "FAIL"} (expected exactly ${CAPACITY} to succeed)`
  );

  if (other.length > 0) {
    console.log("\nUnexpected responses:", other.slice(0, 5));
  }

  if (!capacityRespected || other.length > 0) {
    console.log("\nFAIL — see above.");
    process.exitCode = 1;
  } else {
    console.log(`\n${COUNT} students raced for ${CAPACITY} seats -> exactly ${CAPACITY} won, no overbooking. PASS.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
