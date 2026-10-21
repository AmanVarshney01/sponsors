#!/usr/bin/env bun

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import type {
	ProcessedSponsor,
	RawSponsor,
	SponsorsData,
	UISponsor,
} from "../lib/types.js";
import {
	parseAmount,
	formatAmount,
	roundCurrency,
	normalizeSponsorUrl,
	getCountryName,
	isRecurringTier,
	filterSpecialSponsors,
	filterCurrentSponsors,
	filterPastSponsors,
	filterBackers,
	sortSponsors,
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

// Manual per-sponsor overrides, loaded from sponsor-overrides.json (see below).
const OVERRIDES_FILE: string = join(SOURCE_DIR, "sponsor-overrides.json");

const args: string[] = process.argv.slice(2);
const autoYes: boolean = args.includes("--yes") || args.includes("-y");

// Manual overrides keyed by lowercase GitHub handle. Each entry is a partial
// UISponsor: any field present here replaces the auto-generated value.
type SponsorOverride = Partial<Omit<UISponsor, "githubId">>;

function loadOverrides(): Record<string, SponsorOverride> {
	if (!existsSync(OVERRIDES_FILE)) return {};
	try {
		const raw = JSON.parse(readFileSync(OVERRIDES_FILE, "utf-8")) as Record<
			string,
			SponsorOverride
		>;
		// Normalize keys to lowercase for case-insensitive matching.
		const normalized: Record<string, SponsorOverride> = {};
		for (const [handle, override] of Object.entries(raw)) {
			normalized[handle.toLowerCase()] = override;
		}
		return normalized;
	} catch (err) {
		console.warn(`⚠️  Failed to parse ${OVERRIDES_FILE}:`, err);
		return {};
	}
}

const SPONSOR_OVERRIDES: Record<string, SponsorOverride> = loadOverrides();

const SPONSOR_HANDLE_ALIASES: Record<string, string> = {
	"neon-open-source-treasury": "neondatabase",
};

function getCanonicalSponsorHandle(handle: string): string {
	return SPONSOR_HANDLE_ALIASES[handle.toLowerCase()] ?? handle;
}

function mergeTransactions(
	first: RawSponsor["transactions"],
	second: RawSponsor["transactions"],
): RawSponsor["transactions"] {
	const transactionsById = new Map<
		string,
		RawSponsor["transactions"][number]
	>();

	for (const transaction of [...first, ...second]) {
		transactionsById.set(transaction.transaction_id, transaction);
	}

	return [...transactionsById.values()];
}

function mergeSponsorRecords(rawSponsors: RawSponsor[]): RawSponsor[] {
	const sponsorsByHandle = new Map<string, RawSponsor>();
	const privateSponsors: RawSponsor[] = [];

	for (const sponsor of rawSponsors) {
		if (!sponsor.is_public) {
			privateSponsors.push(sponsor);
			continue;
		}

		const canonicalHandle = getCanonicalSponsorHandle(sponsor.sponsor_handle);
		const canonicalKey = canonicalHandle.toLowerCase();
		const existing = sponsorsByHandle.get(canonicalKey);

		if (!existing) {
			sponsorsByHandle.set(canonicalKey, {
				...sponsor,
				sponsor_handle: canonicalHandle,
				sponsor_profile_name: sponsor.sponsor_profile_name ?? canonicalHandle,
				transactions: [...sponsor.transactions],
				metadata: { ...sponsor.metadata },
			});
			continue;
		}

		const sponsorIsCanonical =
			sponsor.sponsor_handle.toLowerCase() === canonicalKey;
		const identitySource = sponsorIsCanonical ? sponsor : existing;
		const existingStartedAt = new Date(existing.sponsorship_started_on).getTime();
		const sponsorStartedAt = new Date(sponsor.sponsorship_started_on).getTime();

		sponsorsByHandle.set(canonicalKey, {
			...identitySource,
			sponsor_handle: canonicalHandle,
			sponsor_profile_name: identitySource.sponsor_profile_name ?? canonicalHandle,
			sponsor_public_email:
				identitySource.sponsor_public_email ??
				existing.sponsor_public_email ??
				sponsor.sponsor_public_email,
			sponsorship_started_on:
				sponsorStartedAt < existingStartedAt
					? sponsor.sponsorship_started_on
					: existing.sponsorship_started_on,
			is_public: existing.is_public || sponsor.is_public,
			is_yearly: existing.is_yearly || sponsor.is_yearly,
			transactions: mergeTransactions(
				existing.transactions,
				sponsor.transactions,
			),
			metadata: {
				...existing.metadata,
				...sponsor.metadata,
			},
		});
	}

	return [...sponsorsByHandle.values(), ...privateSponsors];
}

async function fetchGitHubUser(
	username: string,
	hasShownTokenWarning: { value: boolean },
): Promise<GitHubUser | null> {
	if (!GITHUB_TOKEN) {
		if (!hasShownTokenWarning.value) {
			console.warn(
				"⚠️  No GitHub token found. Set GITHUB_TOKEN environment variable to fetch website URLs.",
			);
			hasShownTokenWarning.value = true;
		}
		return null;
	}

	try {
		const url = `${GITHUB_API_BASE}/users/${encodeURIComponent(username)}`;
		const headers = new Headers({
			Authorization: `token ${GITHUB_TOKEN}`,
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "sponsorkit/1.0.0",
		});
		let response = await fetch(url, { headers });
		let errorBody = response.ok
			? null
			: (await response.json().catch(() => null)) as { message?: string } | null;

		// Some organizations block classic PATs even for this public endpoint.
		// Retry only that policy rejection; keep using the token for other users.
		if (
			response.status === 403 &&
			response.headers.get("x-ratelimit-remaining") !== "0" &&
			!response.headers.has("retry-after") &&
			errorBody?.message?.includes("forbids access via a personal access token (classic)")
		) {
			console.log(
				`ℹ️  ${username} blocks classic GitHub tokens; fetching its public profile without authentication.`,
			);
			headers.delete("Authorization");
			response = await fetch(url, { headers });
			errorBody = response.ok
				? null
				: (await response.json().catch(() => null)) as { message?: string } | null;
		}

		if (!response.ok) {
			if (response.status === 404) {
				console.warn(`⚠️  User ${username} not found on GitHub`);
				return null;
			}
			const message = errorBody?.message || response.statusText;
			const isRateLimited =
				response.status === 429 ||
				(response.status === 403 && (
					response.headers.get("x-ratelimit-remaining") === "0" ||
					response.headers.has("retry-after") ||
					/rate limit/i.test(message)
				));
			if (isRateLimited) {
				const reset = response.headers.get("x-ratelimit-reset");
				const retryAfter = response.headers.get("retry-after");
				const resetDate = reset ? new Date(Number(reset) * 1000) : null;
				const retryHint = retryAfter
					? ` Retry after ${retryAfter} seconds.`
					: resetDate && !Number.isNaN(resetDate.getTime())
						? ` Resets at ${resetDate.toISOString()}.`
						: "";
				console.warn(`⚠️  GitHub API rate limit for ${username}: ${message}${retryHint}`);
				return null;
			}
			console.warn(`⚠️  GitHub API error for ${username} (${response.status}): ${message}`);
			return null;
		}

		const user = (await response.json()) as GitHubUser;
		return user;
	} catch (error) {
		console.error(`❌ Failed to fetch GitHub user ${username}:`, error);
		return null;
	}
}

async function processSponsorData(rawSponsors: RawSponsor[]): Promise<ProcessedSponsor[]> {
	const validSponsors: ProcessedSponsor[] = [];
	const tokenWarningState = { value: false };

	// Constants for categorization
	const SPECIAL_THRESHOLD = 100; // $100+ = special sponsor
	const NORMAL_MIN_THRESHOLD = 5; // $5+ = normal sponsor
	const RECURRING_ACTIVE_DAYS = 60; // Consider recurring cancelled if no payment in 60 days
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
		const oneTimeTransactions = validTransactions.filter(
			(t) => !isRecurringTier(t.tier_name),
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
			? Math.floor(
				(Date.now() -
					new Date(latestRecurringTransaction.transaction_date).getTime()) /
					(1000 * 60 * 60 * 24),
			)
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
		const latestTransactionDate =
			latestTransaction?.transaction_date || firstSponsorshipDate;

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
			const activeThreshold = isYearlySponsor
				? YEARLY_ACTIVE_DAYS
				: RECURRING_ACTIVE_DAYS;
			// Use daysSinceLastRecurring to properly detect cancelled subscriptions
			isCurrentlyActive = daysSinceLastRecurring <= activeThreshold;
		}

		// Individual $100+ one-time donations get a time-boxed special window.
		const specialOneTimeTransactions = oneTimeTransactions.filter(
			(t) => parseAmount(t.tier_monthly_amount) >= SPECIAL_THRESHOLD,
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
				(Date.now() -
					new Date(latestSpecialOneTime.transaction_date).getTime()) /
					(1000 * 60 * 60 * 24),
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
			? Math.floor(
				(Date.now() -
					new Date(latestOneTimeTransaction.transaction_date).getTime()) /
					(1000 * 60 * 60 * 24),
			)
			: Infinity;
		const latestOneTimeAmount = latestOneTimeTransaction
			? parseAmount(latestOneTimeTransaction.tier_monthly_amount)
			: 0;
		const hasRecentNormalOneTime =
			latestOneTimeAmount >= NORMAL_MIN_THRESHOLD &&
			daysSinceLastOneTime <= ONE_TIME_CURRENT_DAYS;

		// === CATEGORY ASSIGNMENT ===
		// User's rules: $5-99 = normal sponsor, $100+ = special sponsor
		let category: "special" | "current" | "past" | "backers";

		// Check for special status first (individual $100+ donations)
		const hasActiveSpecialRecurring =
			isCurrentlyActive && currentMonthlyAmount >= SPECIAL_THRESHOLD;
		const hasActiveSpecialOneTime = isWithinSpecialWindow;

		if (hasActiveSpecialRecurring || hasActiveSpecialOneTime) {
			category = "special";
		}
		// Check for current sponsors ($5-99 range, active)
		else if (hasRecurringTiers) {
			// Recurring sponsor
			if (isCurrentlyActive && currentMonthlyAmount >= NORMAL_MIN_THRESHOLD) {
				category = "current";
			} else if (hasRecentNormalOneTime) {
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
			if (latestOneTimeAmount >= NORMAL_MIN_THRESHOLD) {
				// Recent one-time donation stays "current" for 30 days
				if (hasRecentNormalOneTime) {
					category = "current";
				} else {
					category = "past";
				}
			} else if (latestOneTimeAmount > 0) {
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
		const githubUser = await fetchGitHubUser(
			sponsor.sponsor_handle,
			tokenWarningState,
		);
		const websiteUrl = normalizeSponsorUrl(githubUser?.blog);

		// Add small delay to respect GitHub API rate limits
		if (GITHUB_TOKEN) {
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		validSponsors.push({
			sponsor: {
				login: sponsor.sponsor_handle,
				name: githubUser?.name || displayName,
				avatarUrl:
					githubUser?.avatar_url ||
					`https://avatars.githubusercontent.com/${sponsor.sponsor_handle}`,
				websiteUrl,
				linkUrl:
					githubUser?.html_url ||
					`https://github.com/${sponsor.sponsor_handle}`,
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

	const totalAmount = roundCurrency(
		sponsors.reduce((sum, s) => sum + s.totalLifetimeAmount, 0),
	);
	const totalMonthlyAmount = roundCurrency(
		sponsors
			.filter((s) => s.isCurrentlyActive)
			.reduce((sum, s) => sum + s.currentMonthlyAmount, 0),
	);
	const topSponsor = [...sponsors].sort(
		(a, b) => b.totalLifetimeAmount - a.totalLifetimeAmount,
	)[0];

	// Helper function to format "since when" nicely
	const formatSinceWhen = (dateString: string): string => {
		const date = new Date(dateString);
		const month = date.toLocaleDateString("en-US", { month: "short" });
		const year = date.getFullYear();
		return `since ${month} ${year}`;
	};

	// Helper function to format sponsor data for UI
	const formatSponsorForUI = (sponsor: ProcessedSponsor): UISponsor => {
		const baseData = {
			name: sponsor.sponsor.name,
			githubId: sponsor.sponsor.login,
			avatarUrl: sponsor.sponsor.avatarUrl,
			websiteUrl: sponsor.sponsor.websiteUrl ?? null,
			githubUrl: sponsor.sponsor.linkUrl,
			tierName: sponsor.tierName,
			sinceWhen: formatSinceWhen(sponsor.firstSponsorshipDate),
			transactionCount: sponsor.transactionCount,
			totalProcessedAmount: roundCurrency(sponsor.totalLifetimeAmount),
			formattedAmount: formatAmount(sponsor.totalLifetimeAmount),
		};

		// Apply any manual overrides for this sponsor (matched by GitHub handle).
		const override = SPONSOR_OVERRIDES[sponsor.sponsor.login.toLowerCase()];
		return override ? { ...baseData, ...override } : baseData;
	};

	// Create output structure optimized for UI
	const output: SponsorsData = {
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
				topSponsor
					? {
						name: topSponsor.sponsor.name,
						amount: roundCurrency(topSponsor.totalLifetimeAmount),
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
		`   • Special sponsors ($100+ active recurring or time-boxed one-time): ${specialSponsors.length}`,
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
			`   • Top sponsor: ${topSponsor?.sponsor.name || "Unknown"} (${formatAmount(topSponsor?.totalLifetimeAmount || 0)} lifetime)`,
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

async function uploadToR2(file: string, targetKey = file): Promise<void> {
	const filePath = join(SOURCE_DIR, file);
	if (!existsSync(filePath)) {
		console.warn(`⚠️  Warning: ${filePath} does not exist.`);
		return;
	}

	console.log(`📤 Uploading ${file} to r2://sponsors/${targetKey} ...`);

	try {
		await Bun.$`bunx wrangler r2 object put sponsors/${targetKey} --file=${filePath} --remote`;
		console.log(`✅ Successfully uploaded ${targetKey}`);
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
		const mergedData = mergeSponsorRecords(rawData);

		if (mergedData.length !== rawData.length) {
			console.log(
				`🔗 Merged ${rawData.length - mergedData.length} aliased sponsorship record(s)`,
			);
		}

		// Process sponsor data
		const processedSponsors = await processSponsorData(mergedData);
		console.log(
			`✨ Processed ${processedSponsors.length} public sponsors with valid transactions`,
		);

		// Generate outputs
		generateSponsorsJson(processedSponsors);

		// Upload to R2 if requested
		if (autoYes) {
			console.log("\n📤 Uploading files to R2...");
			await uploadToR2("generated/sponsors.json", "sponsors.json");
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
