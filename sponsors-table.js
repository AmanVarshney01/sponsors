#!/usr/bin/env node

import { existsSync, readFileSync } from "fs";
import { join } from "path";

const SOURCE_DIR = join(process.cwd(), "sponsorkit");
const SPONSORS_JSON = join(SOURCE_DIR, "sponsors.json");

// Current USD to INR exchange rate (approximate)
const USD_TO_INR = 83.5;

function loadSponsors(filePath) {
    if (!existsSync(filePath)) {
        console.error("sponsors.json not found!");
        return [];
    }
    try {
        return JSON.parse(readFileSync(filePath, "utf8"));
    } catch (err) {
        console.error("Failed to read sponsors.json:", err);
        return [];
    }
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

function createCompactTable(sponsors) {
    console.log("\n📊 SPONSORS OVERVIEW (Exchange Rate: 1 USD = ₹83.5)");
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

// Main execution
const sponsors = loadSponsors(SPONSORS_JSON);

if (sponsors.length === 0) {
    console.log("No sponsors found!");
    process.exit(1);
}

createCompactTable(sponsors);
