const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BUCKET_NAME = "sponsors";
const SOURCE_DIR = path.join(__dirname, "sponsorkit");
const SPONSORS_JSON = path.join(SOURCE_DIR, "sponsors.json");
const SPONSORS_PNG = path.join(SOURCE_DIR, "sponsors.png");

// Step 1: Remove avatarBuffer from sponsors.json
function removeAvatarBuffer(obj) {
  if (Array.isArray(obj)) {
    return obj.map(removeAvatarBuffer);
  } else if (obj && typeof obj === "object") {
    const newObj = {};
    for (const key of Object.keys(obj)) {
      if (key === "avatarBuffer") continue;
      newObj[key] = removeAvatarBuffer(obj[key]);
    }
    return newObj;
  }
  return obj;
}

if (!fs.existsSync(SPONSORS_JSON)) {
  console.error("Error: sponsors.json does not exist. Run sponsorkit first.");
  process.exit(1);
}

let sponsors;
try {
  sponsors = JSON.parse(fs.readFileSync(SPONSORS_JSON, "utf8"));
} catch (err) {
  console.error("Failed to read or parse sponsors.json:", err);
  process.exit(1);
}

const cleanedSponsors = removeAvatarBuffer(sponsors);
fs.writeFileSync(
  SPONSORS_JSON,
  JSON.stringify(cleanedSponsors, null, 2),
  "utf8",
);
console.log("Removed avatarBuffer from all sponsor objects.");

function uploadToR2(file) {
  const filePath = path.join(SOURCE_DIR, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`Warning: ${filePath} does not exist.`);
    return;
  }
  const key = file;
  const cmd = `npx wrangler r2 object put "${BUCKET_NAME}/${key}" --file="${filePath}" --remote`;
  console.log(`Uploading ${filePath} to r2://${BUCKET_NAME}/${key} ...`);
  try {
    execSync(cmd, { stdio: "inherit" });
  } catch (err) {
    console.error(`Failed to upload ${file}:`, err);
  }
}

uploadToR2("sponsors.json");
uploadToR2("sponsors.png");

console.log("Selected files uploaded to R2 bucket:", BUCKET_NAME);
