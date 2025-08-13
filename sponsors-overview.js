#!/usr/bin/env node

import { existsSync, readFileSync } from "fs";
import { join } from "path";

const SOURCE_DIR = join(process.cwd(), "sponsorkit");
const SPONSORS_JSON = join(SOURCE_DIR, "sponsors.json");

// Current USD to INR exchange rate (approximate)
const USD_TO_INR = 83.5; // Update this with current rate

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

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function createSponsorsTable(sponsors) {
    console.log("\n" + "=".repeat(120));
    console.log("📊 COMPLETE SPONSORS OVERVIEW");
    console.log("=".repeat(120));
    console.log(`Exchange Rate: 1 USD = ₹${USD_TO_INR}`);
    console.log("=".repeat(120));

    // Table header
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

    let totalMonthlyUSD = 0;
    let totalOneTimeUSD = 0;
    let monthlySponsors = 0;
    let oneTimeSponsors = 0;

    // Sort sponsors by amount (highest first)
    const sortedSponsors = sponsors.sort((a, b) => {
        const amountA = extractAmount(a).amount;
        const amountB = extractAmount(b).amount;
        return amountB - amountA;
    });

    sortedSponsors.forEach(sponsor => {
        const name = (sponsor.sponsor.name || sponsor.sponsor.login).substring(0, 24);
        const username = `@${sponsor.sponsor.login}`.substring(0, 19);
        const { amount, type } = extractAmount(sponsor);
        const amountINR = Math.round(amount * USD_TO_INR);
        const tier = sponsor.tierName.substring(0, 19);
        const startDate = formatDate(sponsor.createdAt);
        const provider = sponsor.provider.substring(0, 7);

        if (type === "monthly") {
            totalMonthlyUSD += amount;
            monthlySponsors++;
        } else if (type === "one-time") {
            totalOneTimeUSD += amount;
            oneTimeSponsors++;
        }

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

    // Summary
    const totalMonthlyINR = Math.round(totalMonthlyUSD * USD_TO_INR);
    const totalOneTimeINR = Math.round(totalOneTimeUSD * USD_TO_INR);

    console.log("\n📈 SUMMARY:");
    console.log(`Total Sponsors: ${sponsors.length}`);
    console.log(`Monthly Sponsors: ${monthlySponsors}`);
    console.log(`One-time Sponsors: ${oneTimeSponsors}`);
    console.log("");
    console.log(`Monthly Support: $${totalMonthlyUSD} (₹${totalMonthlyINR})`);
    console.log(`One-time Support: $${totalOneTimeUSD} (₹${totalOneTimeINR})`);
    console.log(`Annual Monthly Equivalent: $${totalMonthlyUSD * 12} (₹${totalMonthlyINR * 12})`);
    console.log("");
    console.log(`Total Value: $${totalMonthlyUSD + totalOneTimeUSD} (₹${totalMonthlyINR + totalOneTimeINR})`);

    // Top sponsors
    console.log("\n🏆 TOP 5 SPONSORS:");
    sortedSponsors.slice(0, 5).forEach((sponsor, index) => {
        const { amount, type } = extractAmount(sponsor);
        const amountINR = Math.round(amount * USD_TO_INR);
        const name = sponsor.sponsor.name || sponsor.sponsor.login;
        console.log(`${index + 1}. ${name} - $${amount} (₹${amountINR}) - ${type}`);
    });

    console.log("\n" + "=".repeat(120));
}

// Main execution
const sponsors = loadSponsors(SPONSORS_JSON);

if (sponsors.length === 0) {
    console.log("No sponsors found!");
    process.exit(1);
}

createSponsorsTable(sponsors);
