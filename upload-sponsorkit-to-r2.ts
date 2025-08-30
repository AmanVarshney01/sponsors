#!/usr/bin/env bun

const BUCKET_NAME = "sponsors" as const;
const SOURCE_DIR: string = `${process.cwd()}/sponsorkit`;
const SPONSORS_JSON: string = `${SOURCE_DIR}/sponsors.json`;
const CUSTOM_SPONSORS_JSON: string = `${process.cwd()}/custom-sponsors.json`;

const args: string[] = process.argv.slice(2);
const autoYes: boolean = args.includes("--yes") || args.includes("-y");

async function fileExists(path: string): Promise<boolean> {
  return await Bun.file(path).exists();
}

async function runGenerate(): Promise<void> {
  console.log("🚀 Running sponsorkit with change tracking...");
  try {
    await Bun.$`bun sponsorkit.ts`;
  } catch (err) {
    console.error("❌ Failed to run sponsorkit comparison:", err);
    process.exit(1);
  }
}

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function ensureArray(value: JsonValue): any[] {
  if (Array.isArray(value)) return value as any[];
  return [];
}

function removeAvatarBuffer(obj: JsonValue): JsonValue {
  if (Array.isArray(obj)) return obj.map(removeAvatarBuffer);
  if (obj && typeof obj === "object") {
    const input = obj as { [key: string]: JsonValue | undefined };
    const newObj: { [key: string]: JsonValue } = {};
    for (const key of Object.keys(input)) {
      if (key === "avatarBuffer") continue;
      const value = input[key];
      if (typeof value === "undefined") continue;
      newObj[key] = removeAvatarBuffer(value);
    }
    return newObj;
  }
  return obj;
}

async function loadCustomSponsors(): Promise<any[]> {
  if (!(await fileExists(CUSTOM_SPONSORS_JSON))) return [];
  try {
    const parsed = (await Bun.file(CUSTOM_SPONSORS_JSON).json()) as JsonValue;
    const arr = ensureArray(parsed);
    if (arr.length > 0) {
      console.log(`➕ Appending ${arr.length} custom sponsor(s) from custom-sponsors.json`);
    }
    return arr;
  } catch (err) {
    console.warn("⚠️  Failed to read custom-sponsors.json. Skipping custom sponsors.");
    return [];
  }
}

async function cleanSponsorsJson(): Promise<void> {
  if (!(await fileExists(SPONSORS_JSON))) {
    console.error("Error: sponsors.json does not exist. Run sponsorkit first.");
    process.exit(1);
  }
  let sponsors: JsonValue;
  try {
    sponsors = (await Bun.file(SPONSORS_JSON).json()) as JsonValue;
  } catch (err) {
    console.error("Failed to read or parse sponsors.json:", err);
    process.exit(1);
  }

  const cleanedSponsors = removeAvatarBuffer(sponsors) as any[];

  // Append custom sponsors from file if present
  const customSponsors = await loadCustomSponsors();
  if (customSponsors.length > 0) {
    cleanedSponsors.push(...customSponsors);
  }

  await Bun.write(SPONSORS_JSON, JSON.stringify(cleanedSponsors, null, 2));
}

async function uploadToR2(file: string): Promise<void> {
  const filePath = `${SOURCE_DIR}/${file}`;
  if (!(await fileExists(filePath))) {
    console.warn(`Warning: ${filePath} does not exist.`);
    return;
  }
  const key = file;
  console.log(`Uploading ${filePath} to r2://${BUCKET_NAME}/${key} ...`);
  try {
    await Bun.$`bunx wrangler r2 object put ${`${BUCKET_NAME}/${key}`} --file=${filePath} --remote`;
  } catch (err) {
    console.error(`Failed to upload ${file}:`, err);
  }
}

async function main(): Promise<void> {
  await runGenerate();
  await cleanSponsorsJson();

  if (!autoYes) {
    console.log("Skipping upload (no --yes). Run with --yes to upload.");
    return;
  }

  await uploadToR2("sponsors.json");
  await uploadToR2("sponsors.png");
  console.log("Selected files uploaded to R2 bucket:", BUCKET_NAME);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
