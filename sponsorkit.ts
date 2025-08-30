#!/usr/bin/env bun

const SOURCE_DIR: string = `${process.cwd()}/sponsorkit`;
const SPONSORS_JSON: string = `${SOURCE_DIR}/sponsors.json`;
const FALLBACK_USD_TO_INR: number = 83.5;

let USD_TO_INR: number = FALLBACK_USD_TO_INR;

const args: string[] = process.argv.slice(2);
const showTable: boolean = args.includes('--table') || args.includes('-t');
const showOverview: boolean = args.includes('--overview') || args.includes('-o');

type SponsorRecord = {
  sponsor: { login: string; name?: string } & Record<string, unknown>;
  isOneTime: boolean;
  monthlyDollars?: number;
  tierName?: string;
  createdAt: string;
  provider?: string;
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

function createOverviewTable(sponsors: SponsorRecord[]): void {
  console.log("\n" + "=".repeat(120));
  console.log("📊 COMPLETE SPONSORS OVERVIEW");
  console.log("=".repeat(120));
  console.log(`Exchange Rate: 1 USD = ₹${USD_TO_INR}`);
  console.log("=".repeat(120));

  const header = [
    "Name".padEnd(25),
    "Username".padEnd(20),
    "Type".padEnd(10),
    "USD".padEnd(8),
    "INR".padEnd(10),
    "Tier".padEnd(20),
    "Started".padEnd(12),
    "Provider".padEnd(8)
  ].join(" | ");
  console.log(header);
  console.log("=".repeat(120));

  const sortedSponsors = [...sponsors].sort((a, b) => {
    const aAmt = extractAmount(a).amount;
    const bAmt = extractAmount(b).amount;
    return bAmt - aAmt;
  });

  sortedSponsors.forEach((s) => {
    const name = ((s.sponsor.name || s.sponsor.login) as string).substring(0, 24);
    const username = `@${s.sponsor.login}`.substring(0, 19);
    const { amount, type } = extractAmount(s);
    const amountINR = Math.round(amount * USD_TO_INR);
    const tier = (s.tierName || '').substring(0, 19);
    const startDate = new Date(s.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const provider = (s.provider || '').toString().substring(0, 7);

    const row = [
      name.padEnd(25),
      username.padEnd(20),
      type.padEnd(10),
      `$${amount}`.padEnd(8),
      `₹${amountINR}`.padEnd(10),
      tier.padEnd(20),
      startDate.padEnd(12),
      provider.padEnd(8)
    ].join(" | ");
    console.log(row);
  });

  console.log("=".repeat(120));
}

async function main(): Promise<void> {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
🚀 Sponsorkit - All-in-one sponsor management

Usage:
  bun sponsorkit.ts             Run sponsorkit
  bun sponsorkit.ts --table     Show sponsors table after update
  bun sponsorkit.ts --overview  Show detailed overview after update
`);
    return;
  }

  await fetchExchangeRate();

  console.log("🚀 Running sponsorkit...");

  console.log("⚡ Running sponsorkit...");
  try {
    await Bun.$`sponsorkit`;
  } catch (err) {
    console.error("❌ Failed to run sponsorkit:", err);
    process.exit(1);
  }

  const newSponsors = await loadSponsors(SPONSORS_JSON);

  if (showOverview) createOverviewTable(newSponsors);
  else if (showTable) createCompactTable(newSponsors);

  console.log("\n✅ Sponsorkit update completed!");
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("❌ Error:", message);
  process.exit(1);
});
