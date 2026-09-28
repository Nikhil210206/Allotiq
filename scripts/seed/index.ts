// npm run seed — catalog + 4-week history + demo scenarios, relative to the demo anchor (Wed 13:50 IST).
// Deterministic (seeded PRNG). Owner: Nikhil · N3
import { seedCatalog } from "./catalog";
import { seedHistory } from "./history";
import { seedScenarios } from "./scenarios";

async function main() {
  await seedCatalog();
  await seedHistory();
  await seedScenarios();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
