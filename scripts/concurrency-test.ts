/**
 * Fires N parallel joins at one service and asserts N distinct, gap-free
 * token numbers with zero duplicates — the live proof that token issuance
 * (a single atomic UPDATE ... RETURNING) is race-free under concurrent load.
 * Requires the dev/prod server already running (see BASE_URL).
 */
export {}; // isolate this script's scope (see scripts/booking-concurrency-test.ts)

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const SERVICE_SLUG = process.env.SERVICE_SLUG ?? "lab";
const COUNT = Number(process.env.COUNT ?? 100);

type JoinResult = { status: number; body: unknown };

async function joinOnce(index: number): Promise<JoinResult> {
  const res = await fetch(`${BASE_URL}/api/services/${SERVICE_SLUG}/tickets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      holderName: `Concurrency Test ${index}`,
      studentId: `CONC-${Date.now()}-${index}`,
    }),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  console.log(`Firing ${COUNT} parallel joins at /api/services/${SERVICE_SLUG}/tickets ...`);

  const results = await Promise.all(Array.from({ length: COUNT }, (_, i) => joinOnce(i)));

  const failures = results.filter((r) => r.status !== 201);
  const tokenNumbers = results
    .filter((r) => r.status === 201)
    .map((r) => (r.body as { data: { tokenNumber: number } }).data.tokenNumber);

  const unique = new Set(tokenNumbers);
  const isUnique = unique.size === tokenNumbers.length;

  const sorted = [...tokenNumbers].sort((a, b) => a - b);
  let gapFree = sorted.length > 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) {
      gapFree = false;
      break;
    }
  }

  console.log(`Succeeded: ${tokenNumbers.length}/${COUNT}`);
  console.log(`Failed:    ${failures.length}/${COUNT}`);
  console.log(`Unique tokens:   ${isUnique ? "PASS" : "FAIL"} (${unique.size} distinct values)`);
  console.log(
    `Gap-free range:  ${gapFree ? "PASS" : "FAIL"} (${sorted[0]}..${sorted[sorted.length - 1]})`
  );

  if (failures.length > 0) {
    console.log("\nSample failures:", failures.slice(0, 5));
  }

  if (!isUnique || !gapFree || failures.length > 0) {
    console.log("\nFAIL — see above.");
    process.exitCode = 1;
  } else {
    console.log(`\n${COUNT} parallel joins -> ${COUNT} unique, gap-free tokens. PASS.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
