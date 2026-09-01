import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appConfig = JSON.parse(readFileSync(join(root, "mobile", "app.json"), "utf8")).expo;
const mobilePackage = JSON.parse(readFileSync(join(root, "mobile", "package.json"), "utf8"));

function check(condition, message) {
  if (!condition) throw new Error(message);
}

check(appConfig.android?.package === "com.rozakos.fitness", "Permanent Play package ID changed");
check(appConfig.android?.allowBackup === false, "Android backup must stay disabled for fitness data");
check(appConfig.android?.adaptiveIcon?.backgroundColor === "#2c2c3e", "Adaptive icon background must match the brand");
check(Number.isInteger(appConfig.android?.versionCode) && appConfig.android.versionCode > 0, "Android versionCode must be a positive integer");

const blocked = new Set(appConfig.android?.blockedPermissions ?? []);
for (const permission of [
  "android.permission.READ_EXTERNAL_STORAGE",
  "android.permission.WRITE_EXTERNAL_STORAGE",
  "android.permission.SYSTEM_ALERT_WINDOW",
  "android.permission.USE_BIOMETRIC",
  "android.permission.USE_FINGERPRINT",
  "android.permission.VIBRATE",
]) {
  check(blocked.has(permission), `Unused permission is no longer blocked: ${permission}`);
}

const plugins = appConfig.plugins ?? [];
check(
  plugins.some((plugin) => plugin === "./plugins/with-upload-signing"),
  "Release signing config plugin is missing",
);
const splashPlugin = plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen");
check(
  Array.isArray(splashPlugin) && existsSync(join(root, "mobile", splashPlugin[1]?.image ?? "")),
  "Branded splash image is missing",
);

for (const icon of [
  appConfig.icon,
  appConfig.android?.adaptiveIcon?.foregroundImage,
  appConfig.android?.adaptiveIcon?.monochromeImage,
  appConfig.web?.favicon,
]) {
  check(typeof icon === "string" && existsSync(join(root, "mobile", icon)), `Missing store icon asset: ${icon}`);
}

const iconBytes = readFileSync(join(root, "mobile", appConfig.icon));
const iconHash = createHash("sha256").update(iconBytes).digest("hex");
check(
  iconHash !== "7a667804bb80a6a424a5daf18a2599c4f32237cf06fe78fc0de45dbb09e0eccf",
  "Default Expo launcher icon must not ship to Play",
);
check(iconBytes.readUInt32BE(16) === 1024 && iconBytes.readUInt32BE(20) === 1024, "Play icon must be 1024x1024");

const featureGraphic = readFileSync(join(root, "mobile", "assets", "store", "feature-graphic.png"));
check(
  featureGraphic.readUInt32BE(16) === 1024 && featureGraphic.readUInt32BE(20) === 500,
  "Play feature graphic must be exactly 1024x500",
);

const expoVersion = mobilePackage.dependencies?.expo ?? "";
const expoSdk = Number(expoVersion.match(/\d+/)?.[0]);
check(expoSdk >= 57, "Expo SDK must remain new enough to target Android 16 / API 36");

const backendMain = readFileSync(join(root, "backend", "app", "main.py"), "utf8");
const mobileConfig = readFileSync(join(root, "mobile", "src", "api", "config.ts"), "utf8");
const profile = readFileSync(join(root, "mobile", "src", "app", "(tabs)", "profile.tsx"), "utf8");
const register = readFileSync(join(root, "mobile", "src", "app", "(auth)", "register.tsx"), "utf8");
const storeListing = readFileSync(join(root, "docs", "store-listing.md"), "utf8");

check(backendMain.includes('@app.get("/privacy"'), "Public privacy policy route is missing");
check(backendMain.includes('@app.get("/account-deletion"'), "Public account deletion route is missing");
check(mobileConfig.includes("/privacy"), "Mobile privacy policy URL is missing");
check(profile.includes("PRIVACY_POLICY_URL"), "Profile no longer links the privacy policy");
check(profile.includes("Delete account and data"), "In-app account deletion path is missing");
check(register.includes("PRIVACY_POLICY_URL"), "Registration no longer links the privacy policy");
check(storeListing.includes("Rozakos Fitness"), "Play store listing copy is missing");

console.log("Play-readiness checks passed");
