/**
 * Uploads an .aab to Google Play and assigns it to a track.
 *
 * Called by scripts/release.ps1; usable on its own:
 *
 *   node upload.js --aab ..\..\rozakos-fitness-v1.9.0.aab --track internal \
 *     --credentials %USERPROFILE%\.rozakos-release\play-service-account.json \
 *     --package com.rozakos.fitness
 *
 * The Play Developer API works in "edits": open one, upload into it, set the
 * track, then commit. Nothing is visible on Play until the commit succeeds, so
 * a failure part way through leaves the listing untouched — the abandoned edit
 * simply expires.
 *
 * Two things this cannot do, both by Google's design:
 *   - create the app. A listing must exist in Play Console first.
 *   - deliver the very first release. An app with no prior release rejects an
 *     API upload; that one has to go through the Console by hand.
 * See docs/release.md.
 */
const fs = require("fs");
const path = require("path");
const { google } = require("googleapis");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i].startsWith("--")) throw new Error(`Unexpected argument: ${argv[i]}`);
    args[argv[i].slice(2)] = argv[i + 1];
  }
  for (const required of ["aab", "track", "credentials", "package"]) {
    if (!args[required]) throw new Error(`Missing --${required}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const aabPath = path.resolve(args.aab);
  if (!fs.existsSync(aabPath)) throw new Error(`No .aab at ${aabPath}`);
  if (!fs.existsSync(args.credentials)) throw new Error(`No service-account key at ${args.credentials}`);

  const auth = new google.auth.GoogleAuth({
    keyFile: args.credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
  const play = google.androidpublisher({ version: "v3", auth });
  const packageName = args.package;

  console.log(`Opening an edit for ${packageName}`);
  const edit = await play.edits.insert({ packageName });
  const editId = edit.data.id;

  try {
    console.log(`Uploading ${path.basename(aabPath)} (${(fs.statSync(aabPath).size / 1e6).toFixed(1)} MB)`);
    const uploaded = await play.edits.bundles.upload({
      packageName,
      editId,
      media: { mimeType: "application/octet-stream", body: fs.createReadStream(aabPath) },
    });
    const versionCode = uploaded.data.versionCode;
    console.log(`Uploaded versionCode ${versionCode}`);

    console.log(`Assigning it to the '${args.track}' track`);
    await play.edits.tracks.update({
      packageName,
      editId,
      track: args.track,
      requestBody: {
        track: args.track,
        releases: [{ versionCodes: [String(versionCode)], status: "completed" }],
      },
    });

    await play.edits.commit({ packageName, editId });
    console.log(`Committed. versionCode ${versionCode} is live on '${args.track}'.`);
  } catch (err) {
    // Leave no half-applied edit behind; an abandoned one would otherwise sit
    // around until it expires and collide with the next run.
    try {
      await play.edits.delete({ packageName, editId });
      console.error("Edit rolled back; nothing was published.");
    } catch {
      console.error(`Could not roll back edit ${editId}; it will expire on its own.`);
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(`\nUpload failed: ${err.message}`);
  if (err.code === 403 || err.code === 401) {
    console.error(
      "That usually means the service account is not invited to the app in Play Console, " +
        "or the Google Play Android Developer API is not enabled on its Cloud project.",
    );
  }
  process.exit(1);
});
