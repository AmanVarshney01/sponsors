#!/usr/bin/env bun

const SOURCE_DIR: string = `${process.cwd()}/sponsorkit`;
const SPONSORS_JSON: string = `${SOURCE_DIR}/sponsors.json`;
const BACKUP_JSON: string = `${SOURCE_DIR}/sponsors.backup.json`;
const FALLBACK_USD_TO_INR: number = 83.5;

let USD_TO_INR: number = FALLBACK_USD_TO_INR;

const args: string[] = process.argv.slice(2);
const showTable: boolean = args.includes('--table') || args.includes('-t');
const showOverview: boolean = args.includes('--overview') || args.includes('-o');
const checkOnly: boolean = args.includes('--check') || args.includes('-c');
const skipExchangeRate: boolean = args.includes('--offline') || args.includes('--no-rate');

type SponsorRecord = {
  sponsor: { login: string; name?: string } & Record<string, unknown>;
  isOneTime: boolean;
  monthlyDollars?: number;
  tierName?: string;
  createdAt: string;
  [key: string]: unknown;
};

async function fileExists(path: string): Promise<boolean> {
  return await Bun.file(path).exists();
}

async function fetchExchangeRate(): Promise<boolean> {
  try {
    console.log("🔄 Fetching current USD to INR exchange rate...");
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = (await response.json()) as { rates?: { INR?: number } };
    if (data.rates && typeof data.rates.INR === 'number') {
      USD_TO_INR = Math.round(data.rates.INR * 100) / 100;
      console.log(`✅ Current exchange rate: 1 USD = ₹${USD_TO_INR}`);
      return true;
    }
    throw new Error('INR rate not found in response');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`⚠️  Failed to fetch exchange rate: ${message}`);
    console.log(`📌 Using fallback rate: 1 USD = ₹${FALLBACK_USD_TO_INR}`);
    USD_TO_INR = FALLBACK_USD_TO_INR;
    return false;
  }
}

async function loadSponsors(filePath: string): Promise<SponsorRecord[]> {
  if (!(await fileExists(filePath))) return [];
  try {
    return (await Bun.file(filePath).json()) as SponsorRecord[];
  } catch (err) {
    console.error(`Failed to read or parse ${filePath}:`, err);
    return [];
  }
}

function createSponsorMap(sponsors: SponsorRecord[]): Map<string, SponsorRecord> {
  const map = new Map<string, SponsorRecord>();
  sponsors.forEach((sponsor) => {
    const key = sponsor.sponsor.login;
    map.set(key, sponsor);
  });
  return map;
}

function formatSponsor(sponsor: SponsorRecord): string {
  const name = sponsor.sponsor.name || sponsor.sponsor.login;
  const amount = sponsor.isOneTime
    ? `${sponsor.tierName ?? ''}`
    : `$${sponsor.monthlyDollars ?? 0}/month`;
  const type = sponsor.isOneTime ? "one-time" : "monthly";
  return `  • ${name} (@${sponsor.sponsor.login}) - ${amount} (${type})`;
}

function extractAmount(sponsor: SponsorRecord): { amount: number; type: 'monthly' | 'one-time' | 'unknown' } {
  if (!sponsor.isOneTime && (sponsor.monthlyDollars ?? 0) > 0) {
    return { amount: sponsor.monthlyDollars as number, type: "monthly" };
  } else if (sponsor.isOneTime && typeof sponsor.tierName === 'string') {
    const match = sponsor.tierName.match(/\$(\d+)/);
    if (match && match[1]) {
      return { amount: parseInt(match[1], 10), type: "one-time" };
    }
  }
  return { amount: 0, type: "unknown" };
}

function compareSponsorData(oldSponsors: SponsorRecord[], newSponsors: SponsorRecord[]): {
  added: SponsorRecord[];
  removed: SponsorRecord[];
  changed: { old: SponsorRecord; new: SponsorRecord }[];
} {
  const oldMap = createSponsorMap(oldSponsors);
  const newMap = createSponsorMap(newSponsors);

  const added: SponsorRecord[] = [];
  const removed: SponsorRecord[] = [];
  const changed: { old: SponsorRecord; new: SponsorRecord }[] = [];

  for (const [login, sponsor] of newMap) {
    if (!oldMap.has(login)) {
      added.push(sponsor);
    } else {
      const oldSponsor = oldMap.get(login)!;
      if (JSON.stringify(oldSponsor) !== JSON.stringify(sponsor)) {
        changed.push({ old: oldSponsor, new: sponsor });
      }
    }
  }

  for (const [, sponsor] of oldMap) {
    if (![...newMap.keys()].includes(sponsor.sponsor.login)) removed.push(sponsor);
  }

  return { added, removed, changed };
}

function displayChanges(oldSponsors: SponsorRecord[], newSponsors: SponsorRecord[]): void {
  const { added, removed, changed } = compareSponsorData(oldSponsors, newSponsors);

  console.log("\n" + "=".repeat(60));
  console.log("📊 SPONSOR CHANGES SUMMARY");
  console.log("=".repeat(60));

  console.log(`\n📈 Total sponsors: ${oldSponsors.length} → ${newSponsors.length}`);

  if (added.length > 0) {
    console.log(`\n🎉 NEW SPONSORS (${added.length}):`);
    added.forEach((sponsor) => console.log(formatSponsor(sponsor)));
  }

  if (removed.length > 0) {
    console.log(`\n😢 REMOVED/PAST SPONSORS (${removed.length}):`);
    removed.forEach((sponsor) => console.log(formatSponsor(sponsor)));
  }

  if (changed.length > 0) {
    console.log(`\n🔄 UPDATED SPONSORS (${changed.length}):`);
    changed.forEach(({ old, new: newSponsor }) => {
      console.log(`  • ${newSponsor.sponsor.name || newSponsor.sponsor.login} (@${newSponsor.sponsor.login}):`);
      if (old.monthlyDollars !== newSponsor.monthlyDollars) {
        console.log(`    Amount: $${old.monthlyDollars} → $${newSponsor.monthlyDollars}`);
      }
      if (old.tierName !== newSponsor.tierName) {
        console.log(`    Tier: ${old.tierName} → ${newSponsor.tierName}`);
      }
      if (old.isOneTime !== newSponsor.isOneTime) {
        console.log(`    Type: ${old.isOneTime ? 'one-time' : 'monthly'} → ${newSponsor.isOneTime ? 'one-time' : 'monthly'}`);
      }
    });
  }

  if (added.length === 0 && removed.length === 0 && changed.length === 0) {
    console.log("\n✅ No changes detected in sponsor data");
  }

  console.log("\n" + "=".repeat(60));
}

function calculateTotalSupport(sponsors: SponsorRecord[]): { monthlyTotal: number; oneTimeTotal: number } {
  let monthlyTotal = 0;
  let oneTimeTotal = 0;

  sponsors.forEach((sponsor) => {
    if (sponsor.isOneTime) {
      if (typeof sponsor.tierName === 'string') {
        const match = sponsor.tierName.match(/\$(\d+)/);
        if (match && match[1]) oneTimeTotal += parseInt(match[1], 10);
      }
    } else {
      monthlyTotal += sponsor.monthlyDollars || 0;
    }
  });

  return { monthlyTotal, oneTimeTotal };
}

function displaySupportSummary(oldSponsors: SponsorRecord[], newSponsors: SponsorRecord[]): void {
  const oldSupport = calculateTotalSupport(oldSponsors);
  const newSupport = calculateTotalSupport(newSponsors);

  console.log("\n💰 SUPPORT SUMMARY:");
  console.log(`Monthly: $${oldSupport.monthlyTotal} → $${newSupport.monthlyTotal} (${newSupport.monthlyTotal >= oldSupport.monthlyTotal ? '+' : ''}${newSupport.monthlyTotal - oldSupport.monthlyTotal})`);
  console.log(`One-time total: $${oldSupport.oneTimeTotal} → $${newSupport.oneTimeTotal} (${newSupport.oneTimeTotal >= oldSupport.oneTimeTotal ? '+' : ''}${newSupport.oneTimeTotal - oldSupport.oneTimeTotal})`);
}

function createCompactTable(sponsors: SponsorRecord[]): void {
  console.log(`\n📊 SPONSORS OVERVIEW (Exchange Rate: 1 USD = ₹${USD_TO_INR})`);
  console.log("=".repeat(90));

  const monthlySponsors: Array<{ name: string; username: string; amount: number; amountINR: number; startDate: string }> = [];
  const oneTimeSponsors: Array<{ name: string; username: string; amount: number; amountINR: number; startDate: string }> = [];

  sponsors.forEach((sponsor) => {
    const { amount, type } = extractAmount(sponsor);
    const sponsorData = {
      name: (sponsor.sponsor.name || sponsor.sponsor.login) as string,
      username: sponsor.sponsor.login,
      amount,
      amountINR: Math.round(amount * USD_TO_INR),
      startDate: new Date(sponsor.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    };
    if (type === "monthly") monthlySponsors.push(sponsorData);
    else if (type === "one-time") oneTimeSponsors.push(sponsorData);
  });

  monthlySponsors.sort((a, b) => b.amount - a.amount);
  oneTimeSponsors.sort((a, b) => b.amount - a.amount);

  if (monthlySponsors.length > 0) {
    const topMonthly = monthlySponsors[0];
    console.log("\n💰 MONTHLY SPONSORS");
    console.log("-".repeat(90));
    console.log("Name".padEnd(25) + "Username".padEnd(20) + "USD".padEnd(8) + "INR".padEnd(12) + "Since");
    console.log("-".repeat(90));
    monthlySponsors.forEach((s) => {
      const row = [
        s.name.substring(0, 24).padEnd(25),
        `@${s.username}`.substring(0, 19).padEnd(20),
        `$${s.amount}`.padEnd(8),
        `₹${s.amountINR}`.padEnd(12),
        s.startDate
      ].join("");
      console.log(row);
    });
    if (topMonthly) console.log(`\n🏆 Top Monthly: ${topMonthly.name} - $${topMonthly.amount}/month`);
  }

  if (oneTimeSponsors.length > 0) {
    const topOneTime = oneTimeSponsors[0];
    console.log("\n🎁 ONE-TIME SPONSORS");
    console.log("-".repeat(90));
    console.log("Name".padEnd(25) + "Username".padEnd(20) + "USD".padEnd(8) + "INR".padEnd(12) + "Date");
    console.log("-".repeat(90));
    oneTimeSponsors.forEach((s) => {
      const row = [
        s.name.substring(0, 24).padEnd(25),
        `@${s.username}`.substring(0, 19).padEnd(20),
        `$${s.amount}`.padEnd(8),
        `₹${s.amountINR}`.padEnd(12),
        s.startDate
      ].join("");
      console.log(row);
    });
    if (topOneTime) console.log(`🏆 Highest One-time: ${topOneTime.name} - $${topOneTime.amount}`);
  }

  const totalMonthly = monthlySponsors.reduce((sum, s) => sum + s.amount, 0);
  const totalOneTime = oneTimeSponsors.reduce((sum, s) => sum + s.amount, 0);
  const totalMonthlyINR = Math.round(totalMonthly * USD_TO_INR);
  const totalOneTimeINR = Math.round(totalOneTime * USD_TO_INR);

  console.log("\n" + "=".repeat(90));
  console.log("📈 SUMMARY");
  console.log("=".repeat(90));
  console.log(`Total Sponsors: ${sponsors.length} (${monthlySponsors.length} monthly, ${oneTimeSponsors.length} one-time)`);
  console.log(`Monthly Support: $${totalMonthly}/month (₹${totalMonthlyINR}/month)`);
  console.log(`One-time Support: $${totalOneTime} (₹${totalOneTimeINR})`);
  console.log(`Annual Value: $${totalMonthly * 12 + totalOneTime} (₹${totalMonthlyINR * 12 + totalOneTimeINR})`);
}

async function backupFileIfExists(): Promise<void> {
  if (await fileExists(SPONSORS_JSON)) {
    await Bun.write(BACKUP_JSON, await Bun.file(SPONSORS_JSON).text());
    console.log("📋 Backed up current sponsors.json");
  } else {
    console.log("ℹ️  No existing sponsors.json found");
  }
}

async function main(): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🚀 Sponsorkit - All-in-one sponsor management

Usage:
  bun run generate              Run sponsorkit with change tracking
  bun run generate --table      Show sponsors table after update
  bun run generate --overview   Show detailed overview after update
  bun run generate --check      Just check for changes (no update)
  bun run generate --offline    Skip exchange rate fetch (faster)
`);
    return;
  }

  if (!skipExchangeRate) await fetchExchangeRate();
  else console.log(`📌 Using fallback exchange rate: 1 USD = ₹${USD_TO_INR}`);

  if (checkOnly) {
    if (!(await fileExists(BACKUP_JSON))) {
      console.log("❌ No backup file found. Run 'bun run generate' first to create a backup.");
      process.exit(1);
    }
    if (!(await fileExists(SPONSORS_JSON))) {
      console.log("❌ No current sponsors.json found. Run sponsorkit first.");
      process.exit(1);
    }
    console.log("🔍 Checking for sponsor changes...");
    const oldSponsors = await loadSponsors(BACKUP_JSON);
    const newSponsors = await loadSponsors(SPONSORS_JSON);
    displayChanges(oldSponsors, newSponsors);
    displaySupportSummary(oldSponsors, newSponsors);
    if (showTable || showOverview) createCompactTable(newSponsors);
    return;
  }

  console.log("🚀 Running sponsorkit with change tracking...");

  await backupFileIfExists();
  const oldSponsors = await loadSponsors(BACKUP_JSON);

  console.log("⚡ Running sponsorkit...");
  try {
    await Bun.$`sponsorkit`;
  } catch (err) {
    console.error("❌ Failed to run sponsorkit:", err);
    process.exit(1);
  }

  const newSponsors = await loadSponsors(SPONSORS_JSON);
  if (oldSponsors.length > 0) {
    displayChanges(oldSponsors, newSponsors);
    displaySupportSummary(oldSponsors, newSponsors);
  } else {
    console.log(`\n🎉 First run! Found ${newSponsors.length} sponsors.`);
    const support = calculateTotalSupport(newSponsors);
    console.log(`💰 Monthly support: $${support.monthlyTotal}`);
    console.log(`💰 One-time support total: $${support.oneTimeTotal}`);
  }

  if (showTable || showOverview) createCompactTable(newSponsors);
  console.log("\n✅ Sponsorkit update completed!");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("❌ Error:", message);
  process.exit(1);
});
