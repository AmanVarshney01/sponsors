#!/usr/bin/env node

import { existsSync, readFileSync, copyFileSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const SOURCE_DIR = join(process.cwd(), "sponsorkit");
const SPONSORS_JSON = join(SOURCE_DIR, "sponsors.json");
const BACKUP_JSON = join(SOURCE_DIR, "sponsors.backup.json");
const FALLBACK_USD_TO_INR = 83.5; // Fallback exchange rate

let USD_TO_INR = FALLBACK_USD_TO_INR;

// Get command line arguments
const args = process.argv.slice(2);
const showTable = args.includes('--table') || args.includes('-t');
const showOverview = args.includes('--overview') || args.includes('-o');
const checkOnly = args.includes('--check') || args.includes('-c');
const skipExchangeRate = args.includes('--offline') || args.includes('--no-rate');

async function fetchExchangeRate() {
    try {
        console.log("🔄 Fetching current USD to INR exchange rate...");

        // Using exchangerate-api.com (free tier: 1500 requests/month)
        const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.rates && data.rates.INR) {
            USD_TO_INR = Math.round(data.rates.INR * 100) / 100; // Round to 2 decimal places
            console.log(`✅ Current exchange rate: 1 USD = ₹${USD_TO_INR}`);
            return true;
        } else {
            throw new Error('INR rate not found in response');
        }
    } catch (error) {
        console.log(`⚠️  Failed to fetch exchange rate: ${error.message}`);
        console.log(`📌 Using fallback rate: 1 USD = ₹${FALLBACK_USD_TO_INR}`);
        USD_TO_INR = FALLBACK_USD_TO_INR;
        return false;
    }
}

function loadSponsors(filePath) {
    if (!existsSync(filePath)) {
        return [];
    }
    try {
        return JSON.parse(readFileSync(filePath, "utf8"));
    } catch (err) {
        console.error(`Failed to read or parse ${filePath}:`, err);
        return [];
    }
}

function createSponsorMap(sponsors) {
    const map = new Map();
    sponsors.forEach(sponsor => {
        const key = sponsor.sponsor.login;
        map.set(key, sponsor);
    });
    return map;
}

function formatSponsor(sponsor) {
    const name = sponsor.sponsor.name || sponsor.sponsor.login;
    const amount = sponsor.isOneTime
        ? `${sponsor.tierName}`
        : `$${sponsor.monthlyDollars}/month`;
    const type = sponsor.isOneTime ? "one-time" : "monthly";
    return `  • ${name} (@${sponsor.sponsor.login}) - ${amount} (${type})`;
}

function extractAmount(sponsor) {
    if (!sponsor.isOneTime && sponsor.monthlyDollars > 0) {
        return { amount: sponsor.monthlyDollars, type: "monthly" };
    } else if (sponsor.isOneTime && sponsor.tierName) {
        const match = sponsor.tierName.match(/\$(\d+)/);
        if (match) {
            return { amount: parseInt(match[1]), type: "one-time" };
        }
    }
    return { amount: 0, type: "unknown" };
}

function compareSponsorData(oldSponsors, newSponsors) {
    const oldMap = createSponsorMap(oldSponsors);
    const newMap = createSponsorMap(newSponsors);

    const added = [];
    const removed = [];
    const changed = [];

    // Find new sponsors
    for (const [login, sponsor] of newMap) {
        if (!oldMap.has(login)) {
            added.push(sponsor);
        } else {
            // Check if sponsor details changed
            const oldSponsor = oldMap.get(login);
            if (JSON.stringify(oldSponsor) !== JSON.stringify(sponsor)) {
                changed.push({ old: oldSponsor, new: sponsor });
            }
        }
    }

    // Find removed sponsors
    for (const [login, sponsor] of oldMap) {
        if (!newMap.has(login)) {
            removed.push(sponsor);
        }
    }

    return { added, removed, changed };
}

function displayChanges(oldSponsors, newSponsors) {
    const { added, removed, changed } = compareSponsorData(oldSponsors, newSponsors);

    console.log("\n" + "=".repeat(60));
    console.log("📊 SPONSOR CHANGES SUMMARY");
    console.log("=".repeat(60));

    console.log(`\n📈 Total sponsors: ${oldSponsors.length} → ${newSponsors.length}`);

    if (added.length > 0) {
        console.log(`\n🎉 NEW SPONSORS (${added.length}):`);
        added.forEach(sponsor => {
            console.log(formatSponsor(sponsor));
        });
    }

    if (removed.length > 0) {
        console.log(`\n😢 REMOVED/PAST SPONSORS (${removed.length}):`);
        removed.forEach(sponsor => {
            console.log(formatSponsor(sponsor));
        });
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

function calculateTotalSupport(sponsors) {
    let monthlyTotal = 0;
    let oneTimeTotal = 0;

    sponsors.forEach(sponsor => {
        if (sponsor.isOneTime) {
            // Extract amount from tierName for one-time sponsors
            const match = sponsor.tierName.match(/\$(\d+)/);
            if (match) {
                oneTimeTotal += parseInt(match[1]);
            }
        } else {
            monthlyTotal += sponsor.monthlyDollars || 0;
        }
    });

    return { monthlyTotal, oneTimeTotal };
}

function displaySupportSummary(oldSponsors, newSponsors) {
    const oldSupport = calculateTotalSupport(oldSponsors);
    const newSupport = calculateTotalSupport(newSponsors);

    console.log("\n💰 SUPPORT SUMMARY:");
    console.log(`Monthly: $${oldSupport.monthlyTotal} → $${newSupport.monthlyTotal} (${newSupport.monthlyTotal >= oldSupport.monthlyTotal ? '+' : ''}${newSupport.monthlyTotal - oldSupport.monthlyTotal})`);
    console.log(`One-time total: $${oldSupport.oneTimeTotal} → $${newSupport.oneTimeTotal} (${newSupport.oneTimeTotal >= oldSupport.oneTimeTotal ? '+' : ''}${newSupport.oneTimeTotal - oldSupport.oneTimeTotal})`);
}

function createCompactTable(sponsors) {
    console.log(`\n📊 SPONSORS OVERVIEW (Exchange Rate: 1 USD = ₹${USD_TO_INR})`);
    console.log("=".repeat(90));

    // Separate monthly and one-time sponsors
    const monthlySponsors = [];
    const oneTimeSponsors = [];

    sponsors.forEach(sponsor => {
        const { amount, type } = extractAmount(sponsor);
        const sponsorData = {
            name: sponsor.sponsor.name || sponsor.sponsor.login,
            username: sponsor.sponsor.login,
            amount,
            amountINR: Math.round(amount * USD_TO_INR),
            startDate: new Date(sponsor.createdAt).toLocaleDateString('en-IN', {
                month: 'short',
                year: 'numeric'
            })
        };

        if (type === "monthly") {
            monthlySponsors.push(sponsorData);
        } else if (type === "one-time") {
            oneTimeSponsors.push(sponsorData);
        }
    });

    // Sort by amount (highest first)
    monthlySponsors.sort((a, b) => b.amount - a.amount);
    oneTimeSponsors.sort((a, b) => b.amount - a.amount);

    // Display monthly sponsors
    if (monthlySponsors.length > 0) {
        console.log("\n💰 MONTHLY SPONSORS");
        console.log("-".repeat(90));
        console.log("Name".padEnd(25) + "Username".padEnd(20) + "USD".padEnd(8) + "INR".padEnd(12) + "Since");
        console.log("-".repeat(90));

        monthlySponsors.forEach(sponsor => {
            const row = [
                sponsor.name.substring(0, 24).padEnd(25),
                `@${sponsor.username}`.substring(0, 19).padEnd(20),
                `$${sponsor.amount}`.padEnd(8),
                `₹${sponsor.amountINR}`.padEnd(12),
                sponsor.startDate
            ].join("");
            console.log(row);
        });
    }

    // Display one-time sponsors
    if (oneTimeSponsors.length > 0) {
        console.log("\n🎁 ONE-TIME SPONSORS");
        console.log("-".repeat(90));
        console.log("Name".padEnd(25) + "Username".padEnd(20) + "USD".padEnd(8) + "INR".padEnd(12) + "Date");
        console.log("-".repeat(90));

        oneTimeSponsors.forEach(sponsor => {
            const row = [
                sponsor.name.substring(0, 24).padEnd(25),
                `@${sponsor.username}`.substring(0, 19).padEnd(20),
                `$${sponsor.amount}`.padEnd(8),
                `₹${sponsor.amountINR}`.padEnd(12),
                sponsor.startDate
            ].join("");
            console.log(row);
        });
    }

    // Summary
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

    if (monthlySponsors.length > 0) {
        console.log(`\n🏆 Top Monthly: ${monthlySponsors[0].name} - $${monthlySponsors[0].amount}/month`);
    }
    if (oneTimeSponsors.length > 0) {
        console.log(`🏆 Highest One-time: ${oneTimeSponsors[0].name} - $${oneTimeSponsors[0].amount}`);
    }

    console.log("=".repeat(90));
}

function showHelp() {
    console.log(`
🚀 Sponsorkit - All-in-one sponsor management

Usage:
  pnpm sponsorkit                 Run sponsorkit with change tracking
  pnpm sponsorkit --table         Show sponsors table after update
  pnpm sponsorkit --overview      Show detailed overview after update  
  pnpm sponsorkit --check         Just check for changes (no update)
  pnpm sponsorkit --offline       Skip exchange rate fetch (faster)

Aliases:
  -t, --table     Show compact table
  -o, --overview  Show detailed overview
  -c, --check     Check only mode
  --no-rate       Skip live exchange rate fetch
`);
}

// Main execution
async function main() {
    if (args.includes('--help') || args.includes('-h')) {
        showHelp();
        process.exit(0);
    }

    // Fetch current exchange rate first (unless skipped)
    if (!skipExchangeRate) {
        await fetchExchangeRate();
    } else {
        console.log(`📌 Using fallback exchange rate: 1 USD = ₹${USD_TO_INR}`);
    }

    // Check only mode - don't run sponsorkit
    if (checkOnly) {
        if (!existsSync(BACKUP_JSON)) {
            console.log("❌ No backup file found. Run 'pnpm sponsorkit' first to create a backup.");
            process.exit(1);
        }

        if (!existsSync(SPONSORS_JSON)) {
            console.log("❌ No current sponsors.json found. Run sponsorkit first.");
            process.exit(1);
        }

        console.log("🔍 Checking for sponsor changes...");
        const oldSponsors = loadSponsors(BACKUP_JSON);
        const newSponsors = loadSponsors(SPONSORS_JSON);

        displayChanges(oldSponsors, newSponsors);
        displaySupportSummary(oldSponsors, newSponsors);

        // Show table or overview if requested
        if (showTable || showOverview) {
            createCompactTable(newSponsors);
        }

        process.exit(0);
    }

    console.log("🚀 Running sponsorkit with change tracking...");

    // Step 1: Backup current sponsors.json if it exists
    if (existsSync(SPONSORS_JSON)) {
        copyFileSync(SPONSORS_JSON, BACKUP_JSON);
        console.log("📋 Backed up current sponsors.json");
    } else {
        console.log("ℹ️  No existing sponsors.json found");
    }

    // Step 2: Load old data
    const oldSponsors = loadSponsors(BACKUP_JSON);

    // Step 3: Run sponsorkit
    console.log("⚡ Running sponsorkit...");
    try {
        execSync("sponsorkit", { stdio: "inherit" });
    } catch (err) {
        console.error("❌ Failed to run sponsorkit:", err);
        process.exit(1);
    }

    // Step 4: Load new data and compare
    const newSponsors = loadSponsors(SPONSORS_JSON);

    if (oldSponsors.length > 0) {
        displayChanges(oldSponsors, newSponsors);
        displaySupportSummary(oldSponsors, newSponsors);
    } else {
        console.log(`\n🎉 First run! Found ${newSponsors.length} sponsors.`);
        const support = calculateTotalSupport(newSponsors);
        console.log(`💰 Monthly support: $${support.monthlyTotal}`);
        console.log(`💰 One-time support total: $${support.oneTimeTotal}`);
    }

    // Show table or overview if requested
    if (showTable || showOverview) {
        createCompactTable(newSponsors);
    }

    console.log("\n✅ Sponsorkit update completed!");
}

// Run the main function
main().catch(error => {
    console.error("❌ Error:", error.message);
    process.exit(1);
});
