#!/usr/bin/env bun

import { existsSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import type { ProcessedSponsor, RawSponsor, SponsorsData } from "../lib/types.js";
import {
	parseAmount,
	formatAmount,
	getCountryName,
	isRecurringTier,
	filterSpecialSponsors,
	filterCurrentSponsors,
	filterPastSponsors,
	filterBackers,
	sortSponsors,
	getRelativeTime
} from "../lib/utils.js";

interface GitHubUser {
	login: string;
	name: string | null;
	blog: string | null;
	html_url: string;
	avatar_url: string;
	type: string;
}

const SOURCE_DIR: string = process.cwd();
const GITHUB_EXPORT_FILE: string = join(
	SOURCE_DIR,
	"AmanVarshney01-sponsorships-all-time.json",
);
const OUTPUT_SPONSORS_JSON: string = join(SOURCE_DIR, "generated", "sponsors.json");

// GitHub API configuration
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_API_BASE = "https://api.github.com";

const args: string[] = process.argv.slice(2);
const autoYes: boolean = args.includes("--yes") || args.includes("-y");

async function fetchGitHubUser(username: string, hasShownTokenWarning: { value: boolean }): Promise<GitHubUser | null> {
	if (!GITHUB_TOKEN) {
		if (!hasShownTokenWarning.value) {
			console.warn(`⚠️  No GitHub token found. Set GITHUB_TOKEN environment variable to fetch website URLs.`);
			hasShownTokenWarning.value = true;
		}
		return null;
	}

	try {
		const response = await fetch(`${GITHUB_API_BASE}/users/${username}`, {
			headers: {
				'Authorization': `token ${GITHUB_TOKEN}`,
				'Accept': 'application/vnd.github.v3+json',
				'User-Agent': 'sponsorkit/1.0.0'
			}
		});

		if (!response.ok) {
			if (response.status === 404) {
				console.warn(`⚠️  User ${username} not found on GitHub`);
				return null;
			}
			if (response.status === 403) {
				console.warn(`⚠️  GitHub API rate limit exceeded or token invalid`);
				return null;
			}
			throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
		}

		const user = await response.json() as GitHubUser;
		return user;
	} catch (error) {
		console.error(`❌ Failed to fetch GitHub user ${username}:`, error);
		return null;
	}
}



async function processSponsorData(rawSponsors: RawSponsor[]): Promise<ProcessedSponsor[]> {
	const validSponsors: ProcessedSponsor[] = [];
	let hasShownTokenWarning = false;

	// Constants for categorization
	const SPECIAL_THRESHOLD = 100; // $100+ = special sponsor
	const NORMAL_MIN_THRESHOLD = 5; // $5+ = normal sponsor
	const RECURRING_ACTIVE_DAYS = 45; // Consider recurring cancelled if no payment in 45 days
	const YEARLY_ACTIVE_DAYS = 400; // Yearly sponsors get more leeway
	const ONE_TIME_CURRENT_DAYS = 30; // One-time donations stay "current" for 30 days

	for (const sponsor of rawSponsors) {
		if (!sponsor.is_public) continue;

		const validTransactions = sponsor.transactions.filter(
			(t) => t.status === "settled" || t.status === "credit_balance_adjusted",
		);

		if (validTransactions.length === 0) continue;

		const totalLifetimeAmount = validTransactions.reduce(
			(sum, t) => sum + parseAmount(t.processed_amount),
			0,
		);

		const highestTierAmount = Math.max(
			...validTransactions.map((t) => parseAmount(t.tier_monthly_amount)),
		);

		// Separate recurring and one-time transactions
		const recurringTransactions = validTransactions.filter((t) =>
			isRecurringTier(t.tier_name),
		);
		const oneTimeTransactions = validTransactions.filter((t) => 
			!isRecurringTier(t.tier_name)
		);
		
		const hasRecurringTiers = recurringTransactions.length > 0;
		const recurringTierAmount = hasRecurringTiers
			? Math.max(
				...recurringTransactions.map((t) =>
					parseAmount(t.tier_monthly_amount),
				),
			)
			: 0;

		// Get the latest RECURRING transaction (important for determining if subscription is active)
		const latestRecurringTransaction = recurringTransactions.sort(
			(a, b) =>
				new Date(b.transaction_date).getTime() -
				new Date(a.transaction_date).getTime(),
		)[0];
		
		const currentMonthlyAmount = latestRecurringTransaction
			? parseAmount(latestRecurringTransaction.tier_monthly_amount)
			: 0;

		// Days since last RECURRING transaction (for determining active status)
		const daysSinceLastRecurring = latestRecurringTransaction
			? Math.floor((Date.now() - new Date(latestRecurringTransaction.transaction_date).getTime()) / (1000 * 60 * 60 * 24))
			: Infinity;

		// Determine if primarily one-time or recurring
		const isOneTime =
			!hasRecurringTiers ||
			recurringTransactions.length < validTransactions.length / 2;

		// Get dates
		const firstSponsorshipDate = sponsor.sponsorship_started_on;
		const latestTransaction = validTransactions.sort(
			(a, b) =>
				new Date(b.transaction_date).getTime() -
				new Date(a.transaction_date).getTime(),
		)[0];
		const latestTransactionDate = latestTransaction?.transaction_date || firstSponsorshipDate;

		const daysSinceLastTransaction = Math.floor(
			(Date.now() - new Date(latestTransactionDate).getTime()) /
			(1000 * 60 * 60 * 24),
		);

		// Determine if recurring subscription is currently active
		// Key fix: Use days since last RECURRING transaction, not any transaction
		let isCurrentlyActive: boolean;
		if (!hasRecurringTiers) {
			isCurrentlyActive = false;
		} else {
			const isYearlySponsor = sponsor.is_yearly;
			const activeThreshold = isYearlySponsor ? YEARLY_ACTIVE_DAYS : RECURRING_ACTIVE_DAYS;
			// Use daysSinceLastRecurring to properly detect cancelled subscriptions
			isCurrentlyActive = daysSinceLastRecurring <= activeThreshold;
		}

		// Find special qualifying transactions ($100+ individual donations)
		// Key fix: Check individual transaction amounts, not cumulative totals
		const specialOneTimeTransactions = oneTimeTransactions.filter(
			(t) => parseAmount(t.tier_monthly_amount) >= SPECIAL_THRESHOLD
		);
		
		// Get the most recent $100+ one-time donation and calculate its special status window
		const latestSpecialOneTime = specialOneTimeTransactions.sort(
			(a, b) =>
				new Date(b.transaction_date).getTime() -
				new Date(a.transaction_date).getTime(),
		)[0];
		
		// Calculate special status duration based on individual donation amount
		// $100 = 1 month, $200 = 2 months, etc.
		let isWithinSpecialWindow = false;
		if (latestSpecialOneTime) {
			const donationAmount = parseAmount(latestSpecialOneTime.tier_monthly_amount);
			const specialMonths = Math.max(1, Math.floor(donationAmount / 100));
			const specialDays = specialMonths * 30;
			const daysSinceSpecialDonation = Math.floor(
				(Date.now() - new Date(latestSpecialOneTime.transaction_date).getTime()) / (1000 * 60 * 60 * 24)
			);
			isWithinSpecialWindow = daysSinceSpecialDonation <= specialDays;
		}

		// Get the most recent one-time transaction for "current" status window
		const latestOneTimeTransaction = oneTimeTransactions.sort(
			(a, b) =>
				new Date(b.transaction_date).getTime() -
				new Date(a.transaction_date).getTime(),
		)[0];
		const daysSinceLastOneTime = latestOneTimeTransaction
			? Math.floor((Date.now() - new Date(latestOneTimeTransaction.transaction_date).getTime()) / (1000 * 60 * 60 * 24))
			: Infinity;

		// === CATEGORY ASSIGNMENT ===
		// User's rules: $5-99 = normal sponsor, $100+ = special sponsor
		let category: "special" | "current" | "past" | "backers";

		// Check for special status first (individual $100+ donations)
		const hasActiveSpecialRecurring = isCurrentlyActive && currentMonthlyAmount >= SPECIAL_THRESHOLD;
		const hasActiveSpecialOneTime = isWithinSpecialWindow;
		
		if (hasActiveSpecialRecurring || hasActiveSpecialOneTime) {
			category = "special";
		}
		// Check for current sponsors ($5-99 range, active)
		else if (hasRecurringTiers) {
			// Recurring sponsor
			if (isCurrentlyActive && currentMonthlyAmount >= NORMAL_MIN_THRESHOLD) {
				category = "current";
			} else if (currentMonthlyAmount >= NORMAL_MIN_THRESHOLD) {
				// Had a $5+ tier but no longer active
				category = "past";
			} else if (currentMonthlyAmount > 0) {
				category = "backers";
			} else {
				category = "past";
			}
		}
		// Pure one-time sponsors
		else {
			const latestAmount = latestOneTimeTransaction 
				? parseAmount(latestOneTimeTransaction.tier_monthly_amount)
				: 0;
			
			if (latestAmount >= NORMAL_MIN_THRESHOLD) {
				// Recent one-time donation stays "current" for 30 days
				if (daysSinceLastOneTime <= ONE_TIME_CURRENT_DAYS) {
					category = "current";
				} else {
					category = "past";
				}
			} else if (latestAmount > 0) {
				category = "backers";
			} else {
				category = "past";
			}
		}
		const allTierNames = Array.from(
			new Set(validTransactions.map((t) => t.tier_name)),
		);

		// Determine which tier to display as primary
		let primaryTier;

		// If they're special because of a recent $100+ one-time donation, show that
		if (category === "special" && isWithinSpecialWindow && latestSpecialOneTime) {
			primaryTier = latestSpecialOneTime;
		}
		// For currently active recurring sponsors, use their current recurring tier
		else if (isCurrentlyActive && latestRecurringTransaction) {
			primaryTier = latestRecurringTransaction;
		}
		// For one-time sponsors, use the most recent one-time transaction
		else if (latestOneTimeTransaction) {
			primaryTier = latestOneTimeTransaction;
		}
		// Fallback: use the highest tier amount
		else {
			primaryTier = validTransactions.sort(
				(a, b) =>
					parseAmount(b.tier_monthly_amount) -
					parseAmount(a.tier_monthly_amount),
			)[0];
		}

		// Get countries
		const countries = Array.from(
			new Set(
				validTransactions
					.map((t) => getCountryName(t.billing_country))
					.filter(Boolean),
			),
		);

		const displayName =
			sponsor.sponsor_profile_name || sponsor.sponsor_handle;

		// Fetch GitHub user data for website URL
		const githubUser = await fetchGitHubUser(sponsor.sponsor_handle, { value: hasShownTokenWarning });
		const websiteUrl = githubUser?.blog || null;

		// Add small delay to respect GitHub API rate limits
		await new Promise(resolve => setTimeout(resolve, 100));

		validSponsors.push({
			sponsor: {
				login: sponsor.sponsor_handle,
				name: githubUser?.name || displayName,
				avatarUrl: githubUser?.avatar_url || `https://avatars.githubusercontent.com/${sponsor.sponsor_handle}`,
				websiteUrl,
				linkUrl: githubUser?.html_url || `https://github.com/${sponsor.sponsor_handle}`,
				customLogoUrl: undefined,
				type: githubUser?.type || "User",
			},
			// Core sponsorship data
			totalLifetimeAmount,
			currentMonthlyAmount,
			highestTierAmount,
			isOneTime,
			monthlyDollars: highestTierAmount, // UI compatibility

			// Transaction details
			transactionCount: validTransactions.length,
			firstSponsorshipDate,
			latestTransactionDate,
			allTierNames,
			tierName: primaryTier?.tier_name || "Unknown",

			// Status and categorization
			isCurrentlyActive,
			daysSinceLastTransaction,
			category,

			// UI compatibility
			privacyLevel: "PUBLIC",
			createdAt: firstSponsorshipDate,
			provider: sponsor.payment_source,

			// Additional metadata
			countries,
			hasRecurringTiers,
			recurringTierAmount,
		});
	}

	return sortSponsors(validSponsors);
}

function generateSponsorsJson(sponsors: ProcessedSponsor[]): void {
	// Create summary statistics
	const specialSponsors = filterSpecialSponsors(sponsors);
	const currentSponsors = filterCurrentSponsors(sponsors);
	const pastSponsors = filterPastSponsors(sponsors);
	const backers = filterBackers(sponsors);

	const totalAmount = sponsors.reduce(
		(sum, s) => sum + s.totalLifetimeAmount,
		0,
	);
	const totalMonthlyAmount = sponsors
		.filter((s) => s.isCurrentlyActive)
		.reduce((sum, s) => sum + s.currentMonthlyAmount, 0);



	// Helper function to format "since when" nicely
	const formatSinceWhen = (dateString: string): string => {
		const date = new Date(dateString);
		const month = date.toLocaleDateString('en-US', { month: 'short' });
		const year = date.getFullYear();
		return `since ${month} ${year}`;
	};

	// Helper function to format sponsor data for UI
	const formatSponsorForUI = (sponsor: ProcessedSponsor) => {
		const baseData = {
			name: sponsor.sponsor.name,
			githubId: sponsor.sponsor.login,
			avatarUrl: sponsor.sponsor.avatarUrl,
			websiteUrl: sponsor.sponsor.websiteUrl,
			githubUrl: sponsor.sponsor.linkUrl,
			tierName: sponsor.tierName,
			sinceWhen: formatSinceWhen(sponsor.firstSponsorshipDate),
			transactionCount: sponsor.transactionCount,
		};

		// Only include total amount fields for sponsors with multiple transactions
		if (sponsor.transactionCount > 1) {
			return {
				...baseData,
				totalProcessedAmount: sponsor.totalLifetimeAmount,
				formattedAmount: formatAmount(sponsor.totalLifetimeAmount),
			};
		}

		return baseData;
	};

	// Create output structure optimized for UI
	const output = {
		// Metadata
		generated_at: new Date().toISOString(),
		summary: {
			total_sponsors: sponsors.length,
			total_lifetime_amount: totalAmount,
			total_current_monthly: totalMonthlyAmount,
			special_sponsors: specialSponsors.length,
			current_sponsors: currentSponsors.length,
			past_sponsors: pastSponsors.length,
			backers: backers.length,
			top_sponsor:
				sponsors.length > 0
					? {
						name: sponsors[0]?.sponsor.name || "Unknown",
						amount: sponsors[0]?.totalLifetimeAmount || 0,
					}
					: null,
		},

		// UI-optimized categorized sponsors
		specialSponsors: specialSponsors.map(formatSponsorForUI),
		sponsors: currentSponsors.map(formatSponsorForUI),
		pastSponsors: pastSponsors.map(formatSponsorForUI),
		backers: backers.map(formatSponsorForUI),


	};



	// Ensure the directory exists
	mkdirSync(dirname(OUTPUT_SPONSORS_JSON), { recursive: true });
	writeFileSync(OUTPUT_SPONSORS_JSON, JSON.stringify(output, null, 2));

	// Log summary
	console.log(`✅ Generated sponsors.json with ${sponsors.length} sponsors`);
	console.log("\n📈 Summary:");
	console.log(`   • Total sponsors: ${sponsors.length}`);
	console.log(
		`   • Special sponsors ($100+ monthly tier): ${specialSponsors.length}`,
	);
	console.log(`   • Current sponsors: ${currentSponsors.length}`);
	console.log(`   • Past sponsors: ${pastSponsors.length}`);
	console.log(`   • Backers ($0 to <$5): ${backers.length}`);
	console.log(`   • Total lifetime amount: ${formatAmount(totalAmount)}`);
	console.log(
		`   • Current monthly recurring: ${formatAmount(totalMonthlyAmount)}`,
	);

	if (sponsors.length > 0) {
		console.log(
			`   • Top sponsor: ${sponsors[0]?.sponsor.name || "Unknown"} (${formatAmount(sponsors[0]?.totalLifetimeAmount || 0)} lifetime)`,
		);
	}

	// Log some examples of complex sponsors
	const complexSponsors = sponsors.filter((s) => s.transactionCount > 1);
	if (complexSponsors.length > 0) {
		console.log(
			`\n🔍 Complex sponsors with multiple transactions: ${complexSponsors.length}`,
		);
		complexSponsors.slice(0, 3).forEach((sponsor) => {
			console.log(
				`   • ${sponsor.sponsor.name}: ${sponsor.transactionCount} transactions, ${formatAmount(sponsor.totalLifetimeAmount)} total`,
			);
		});
	}
}

async function uploadToR2(file: string): Promise<void> {
	const filePath = join(SOURCE_DIR, file);
	if (!existsSync(filePath)) {
		console.warn(`⚠️  Warning: ${filePath} does not exist.`);
		return;
	}

	const key = file;
	console.log(`📤 Uploading ${file} to r2://sponsors/${key} ...`);

	try {
		await Bun.$`bunx wrangler r2 object put sponsors/${key} --file=${filePath} --remote`;
		console.log(`✅ Successfully uploaded ${file}`);
	} catch (err) {
		console.error(`❌ Failed to upload ${file}:`, err);
	}
}

async function main(): Promise<void> {
	console.log("🚀 Processing GitHub sponsorship data...");

	// Check if GitHub export file exists
	if (!existsSync(GITHUB_EXPORT_FILE)) {
		console.error(`❌ Error: ${GITHUB_EXPORT_FILE} does not exist.`);
		console.log(
			"Please make sure to place your GitHub sponsorship export file in the same directory.",
		);
		process.exit(1);
	}

	try {
		// Read and parse GitHub export
		const rawData = (await Bun.file(GITHUB_EXPORT_FILE).json()) as RawSponsor[];
		console.log(`📊 Found ${rawData.length} total sponsorship records`);

		// Process sponsor data
		const processedSponsors = await processSponsorData(rawData);
		console.log(
			`✨ Processed ${processedSponsors.length} public sponsors with valid transactions`,
		);

		// Generate outputs
		generateSponsorsJson(processedSponsors);

		// Upload to R2 if requested
		if (autoYes) {
			console.log("\n📤 Uploading files to R2...");
			await uploadToR2("sponsors.json");
			console.log(`✅ Files uploaded to R2 bucket`);
		} else {
			console.log("\n💡 Run with --yes to upload files to R2");
		}
	} catch (error) {
		console.error("❌ Error processing sponsorship data:", error);
		process.exit(1);
	}
}

main().catch((error) => {
	console.error("❌ Unexpected error:", error);
	process.exit(1);
});
