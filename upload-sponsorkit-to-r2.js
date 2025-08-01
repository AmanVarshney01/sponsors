import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";
import { createInterface } from "readline";

const BUCKET_NAME = "sponsors";
const SOURCE_DIR = join(__dirname, "sponsorkit");
const SPONSORS_JSON = join(SOURCE_DIR, "sponsors.json");
const SPONSORS_PNG = join(SOURCE_DIR, "sponsors.png");

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

if (!existsSync(SPONSORS_JSON)) {
  console.error("Error: sponsors.json does not exist. Run sponsorkit first.");
  process.exit(1);
}

let sponsors;
try {
  sponsors = JSON.parse(readFileSync(SPONSORS_JSON, "utf8"));
} catch (err) {
  console.error("Failed to read or parse sponsors.json:", err);
  process.exit(1);
}

const cleanedSponsors = removeAvatarBuffer(sponsors);

// Add custom sponsor entry
cleanedSponsors.push({
  sponsor: {
    login: "brandonmcconnell",
    name: "Brandon McConnell",
    avatarUrl:
      "https://avatars.githubusercontent.com/u/5913254?u=50b053e50a75f2f4b320a9b5cd0173ce16e379fe&v=4",
    websiteUrl: "https://codepen.io/brandonmcconnell",
    linkUrl: "https://github.com/brandonmcconnell",
    type: "User",
  },
  isOneTime: false,
  monthlyDollars: 150,
  privacyLevel: "PUBLIC",
  tierName: "$150 one time",
  createdAt: "2025-06-12T16:37:43Z",
  provider: "github",
});

console.log("Added custom sponsor: Brandon McConnell");

// Save the modified sponsors JSON
writeFileSync(SPONSORS_JSON, JSON.stringify(cleanedSponsors, null, 2), "utf8");

function uploadToR2(file) {
  const filePath = join(SOURCE_DIR, file);
  if (!existsSync(filePath)) {
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

const rl = createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Do you want to upload the files to R2? (y/n): ", (answer) => {
  if (answer.toLowerCase() === "y" || answer.toLowerCase() === "yes") {
    console.log("Proceeding with upload...");
    uploadToR2("sponsors.json");
    uploadToR2("sponsors.png");
    console.log("Selected files uploaded to R2 bucket:", BUCKET_NAME);
  } else {
    console.log("Upload cancelled.");
  }
  rl.close();
});
