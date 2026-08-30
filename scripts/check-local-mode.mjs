/**
 * Exercises mobile/src/local/api.ts — the on-phone reimplementation of the REST
 * surface used by local-only mode — against the same expectations the backend
 * tests hold the real API to.
 *
 * There is no test runner in mobile/, and this file is the one place where a
 * behaviour can drift away from backend/app/routers/ without anything noticing.
 * AGENTS.md described compiling it to CommonJS and driving it from node as a
 * manual trick; this is that trick, committed and wired into CI.
 *
 * Run from anywhere:  node scripts/check-local-mode.mjs
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const mobileDir = join(repoRoot, "mobile");
const workDir = mkdtempSync(join(tmpdir(), "rozakos-local-mode-"));
const outDir = join(workDir, "out");

let failures = 0;
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail === undefined ? "" : `  ${JSON.stringify(detail)}`}`);
  }
}

async function statusOf(promise) {
  try {
    await promise;
    return 200;
  } catch (err) {
    return err.status ?? `threw ${err.message}`;
  }
}

function compile() {
  // --ignoreConfig: tsconfig.json is not loaded when files are named on the
  // command line, and tsc treats that as an error unless told to skip it.
  // --ignoreDeprecations: the classic node resolution this CommonJS emit needs
  // is deprecated but not yet removed.
  // Invoked as `node node_modules/typescript/bin/tsc` rather than through npx:
  // Node refuses to spawn a .cmd shim without a shell on Windows, and this skips
  // the npx resolution step anyway.
  const tsc = join(mobileDir, "node_modules", "typescript", "bin", "tsc");
  if (!existsSync(tsc)) {
    throw new Error(`TypeScript not installed at ${tsc}. Run 'npm ci' in mobile/ first.`);
  }
  execFileSync(
    process.execPath,
    [
      tsc,
      "--ignoreConfig",
      "src/local/api.ts",
      "src/local/db.ts",
      "src/local/catalog.ts",
      "src/api/types.ts",
      "src/api/error.ts",
      "--outDir",
      outDir,
      "--module",
      "commonjs",
      "--target",
      "es2020",
      "--moduleResolution",
      "node10",
      "--ignoreDeprecations",
      "6.0",
      "--skipLibCheck",
      "--esModuleInterop",
    ],
    { cwd: mobileDir, stdio: "inherit" },
  );

  // local/db.ts reads Platform.OS; "web" routes its storage at localStorage,
  // which keeps the whole thing in memory here.
  const stubDir = join(outDir, "node_modules", "react-native");
  mkdirSync(stubDir, { recursive: true });
  writeFileSync(join(stubDir, "index.js"), 'module.exports = { Platform: { OS: "web" } };\n');
  writeFileSync(
    join(stubDir, "package.json"),
    JSON.stringify({ name: "react-native", version: "0.0.0", main: "index.js" }) + "\n",
  );
}

async function run(localApi) {
  console.log("\nmachine setup rows");
  const bench = (await localApi("/exercises?search=Bench Press"))[0];
  check("a built-in exercise starts with an empty list", Array.isArray(bench.setup) && bench.setup.length === 0, bench.setup);

  const saved = await localApi(`/exercises/${bench.id}`, {
    method: "PATCH",
    body: { setup: [{ label: "  Seat height ", value: " 4 " }, { label: "Back pad", value: "2" }] },
  });
  check(
    "labels and values are trimmed",
    JSON.stringify(saved.setup) ===
      JSON.stringify([{ label: "Seat height", value: "4" }, { label: "Back pad", value: "2" }]),
    saved.setup,
  );

  const listed = (await localApi("/exercises?search=Bench Press"))[0];
  check("setup surfaces on the list route, not just the detail one", listed.setup[0].value === "4", listed.setup);

  check("a blank label is rejected", (await statusOf(localApi(`/exercises/${bench.id}`, { method: "PATCH", body: { setup: [{ label: "  ", value: "4" }] } }))) === 422);
  check("a blank value is rejected", (await statusOf(localApi(`/exercises/${bench.id}`, { method: "PATCH", body: { setup: [{ label: "Seat", value: "" }] } }))) === 422);
  check("an over-long field is rejected", (await statusOf(localApi(`/exercises/${bench.id}`, { method: "PATCH", body: { setup: [{ label: "S".repeat(41), value: "4" }] } }))) === 422);
  check(
    "more than 12 rows is rejected",
    (await statusOf(localApi(`/exercises/${bench.id}`, { method: "PATCH", body: { setup: Array.from({ length: 13 }, (_, i) => ({ label: `k${i}`, value: `${i}` })) } }))) === 422,
  );

  const survived = await localApi(`/exercises/${bench.id}`);
  check("a rejected PATCH leaves the stored rows alone", survived.setup.length === 2, survived.setup);

  const otherKey = await localApi(`/exercises/${bench.id}`, { method: "PATCH", body: { video_url: null } });
  check("omitting the key leaves setup untouched", otherKey.setup.length === 2, otherKey.setup);

  const cleared = await localApi(`/exercises/${bench.id}`, { method: "PATCH", body: { setup: [] } });
  check("an empty list clears it", cleared.setup.length === 0, cleared.setup);

  const custom = await localApi("/exercises", {
    method: "POST",
    body: { name: "Hammer Chest Press", muscle_group: "chest", equipment: "machine", setup: [{ label: "Seat height", value: "4" }] },
  });
  check("a custom exercise keeps its setup", custom.setup[0].label === "Seat height", custom.setup);

  const plain = await localApi("/exercises", { method: "POST", body: { name: "Wall Ball", muscle_group: "legs" } });
  check("a custom exercise created without setup gets []", plain.setup.length === 0, plain.setup);

  console.log("\nno aliasing (the v1.6 rule)");
  await localApi(`/exercises/${bench.id}`, { method: "PATCH", body: { setup: [{ label: "Seat", value: "4" }] } });
  const first = await localApi(`/exercises/${bench.id}`);
  const second = await localApi(`/exercises/${bench.id}`);
  check("each read returns fresh objects", first.setup !== second.setup && first.setup[0] !== second.setup[0]);
  first.setup[0].value = "MUTATED";
  const afterMutation = await localApi(`/exercises/${bench.id}`);
  check("mutating a returned row cannot corrupt the store", afterMutation.setup[0].value === "4", afterMutation.setup);

  console.log("\nperformed order");
  const squat = (await localApi("/exercises?search=Back Squat"))[0];
  const workout = await localApi("/workouts", { method: "POST", body: {} });
  // bench is added to the session list first, squat second...
  const benchWe = await localApi(`/workouts/${workout.id}/exercises`, { method: "POST", body: { exercise_id: bench.id } });
  const squatWe = await localApi(`/workouts/${workout.id}/exercises`, { method: "POST", body: { exercise_id: squat.id } });
  // ...but squat is the one actually worked first
  await localApi(`/workouts/${workout.id}/exercises/${squatWe.id}/sets`, { method: "POST", body: { reps: 5, weight_kg: 100 } });
  await new Promise((resolve) => setTimeout(resolve, 5));
  await localApi(`/workouts/${workout.id}/exercises/${benchWe.id}/sets`, { method: "POST", body: { reps: 8, weight_kg: 60 } });
  // dragging bench down the card list must not rewrite history
  await localApi(`/workouts/${workout.id}/exercises/${benchWe.id}`, { method: "PATCH", body: { order: 99 } });
  await localApi(`/workouts/${workout.id}/finish`, { method: "POST", body: {} });

  const squatHistory = await localApi(`/exercises/${squat.id}/history`);
  check("the lift worked first reports 1 of 2", squatHistory[0].position === 1 && squatHistory[0].total_exercises === 2, squatHistory[0]);
  const benchHistory = await localApi(`/exercises/${bench.id}/history`);
  check("order=99 does not change what already happened", benchHistory[0].position === 2 && benchHistory[0].total_exercises === 2, benchHistory[0]);

  console.log("\nskipped exercises");
  const second_workout = await localApi("/workouts", { method: "POST", body: {} });
  const onlyWorked = await localApi(`/workouts/${second_workout.id}/exercises`, { method: "POST", body: { exercise_id: bench.id } });
  await localApi(`/workouts/${second_workout.id}/exercises`, { method: "POST", body: { exercise_id: squat.id } });
  await localApi(`/workouts/${second_workout.id}/exercises/${onlyWorked.id}/sets`, { method: "POST", body: { reps: 8, weight_kg: 65 } });
  await localApi(`/workouts/${second_workout.id}/finish`, { method: "POST", body: {} });
  const skipped = await localApi(`/exercises/${bench.id}/history`);
  check("an exercise with no sets is not counted", skipped[0].position === 1 && skipped[0].total_exercises === 1, skipped[0]);
}

async function main() {
  console.log(`Compiling local-mode sources to ${outDir}`);
  compile();

  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  };

  const require = createRequire(join(outDir, "noop.cjs"));
  const { localApi } = require(join(outDir, "local", "api.js"));

  await run(localApi);

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nall local-mode checks passed");
  return failures === 0;
}

main()
  .then((ok) => {
    rmSync(workDir, { recursive: true, force: true });
    process.exit(ok ? 0 : 1);
  })
  .catch((err) => {
    console.error(`\nlocal-mode check crashed: ${err.stack ?? err.message}`);
    rmSync(workDir, { recursive: true, force: true });
    process.exit(1);
  });
