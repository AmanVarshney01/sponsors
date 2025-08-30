import type { ProcessedSponsor, RawSponsor, Transaction } from "./types.js";

export function parseAmount(amountStr: string): number {
	return parseFloat(amountStr.replace("$", ""));
}

export function formatAmount(amount: number): string {
	return `$${amount.toFixed(2)}`;
}

export function formatAmountShort(amount: number): string {
	if (amount >= 1000) {
		return `$${(amount / 1000).toFixed(1)}k`;
	}
	return `$${Math.round(amount)}`;
}

export function formatAmountDetailed(amount: number): string {
	return `$${amount.toFixed(2)}`;
}
export function getCountryName(countryCode: string): string {
	const countryNames: Record<string, string> = {
		USA: "United States",
		"United States of America": "United States",
		GBR: "United Kingdom",
		DEU: "Germany",
		FRA: "France",
		BRA: "Brazil",
		CHN: "China",
		JPN: "Japan",
		KOR: "South Korea",
		CHE: "Switzerland",
		SWE: "Sweden",
		POL: "Poland",
		ARE: "UAE",
		TZA: "Tanzania",
		COL: "Colombia",
		India: "India",
		Israel: "Israel",
	};
	return countryNames[countryCode] || countryCode;
}

export function isRecurringTier(tierName: string): boolean {
	return (
		tierName.includes("a month") ||
		tierName.includes("monthly") ||
		tierName.includes("/month")
	);
}

export function formatSponsorUrl(url: string | undefined): string {
	if (!url) return "";

	try {
		const urlObj = new URL(url);
		return urlObj.hostname.replace("www.", "");
	} catch {
		return url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] || "";
	}
}

export function getSponsorUrl(entry: ProcessedSponsor): string {
	return entry.sponsor.websiteUrl || entry.sponsor.linkUrl;
}

export function isSpecialSponsor(entry: ProcessedSponsor): boolean {
	return entry.category === "special";
}

export function shouldShowLifetimeTotal(entry: ProcessedSponsor): boolean {
	return (
		entry.category === "special" ||
		entry.transactionCount > 1 ||
		(!entry.isOneTime && entry.currentMonthlyAmount > 0) ||
		entry.totalLifetimeAmount >= 50
	);
}


export function filterCurrentSponsors(sponsors: ProcessedSponsor[]): ProcessedSponsor[] {
	return sponsors.filter((sponsor) => sponsor.category === "current");
}

export function filterPastSponsors(sponsors: ProcessedSponsor[]): ProcessedSponsor[] {
	return sponsors.filter((sponsor) => sponsor.category === "past");
}

export function filterSpecialSponsors(sponsors: ProcessedSponsor[]): ProcessedSponsor[] {
	return sponsors.filter((sponsor) => sponsor.category === "special");
}

export function filterVisibleSponsors(sponsors: ProcessedSponsor[]): ProcessedSponsor[] {
	return sponsors.filter((sponsor) => sponsor.privacyLevel === "PUBLIC");
}


export function sortSpecialSponsors(sponsors: ProcessedSponsor[]): ProcessedSponsor[] {
	return [...sponsors]
		.filter((s) => s.category === "special")
		.sort((a, b) => {
			if (a.totalLifetimeAmount !== b.totalLifetimeAmount) {
				return b.totalLifetimeAmount - a.totalLifetimeAmount;
			}
			if (a.highestTierAmount !== b.highestTierAmount) {
				return b.highestTierAmount - a.highestTierAmount;
			}
			return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
		});
}

export function sortSponsors(sponsors: ProcessedSponsor[]): ProcessedSponsor[] {
	return [...sponsors].sort((a, b) => {
		// First, sort by category (special > current > past)
		const categoryOrder = { special: 0, current: 1, past: 2 };
		if (a.category !== b.category) {
			return categoryOrder[a.category] - categoryOrder[b.category];
		}

		// Within same category, sort by total lifetime amount
		if (a.totalLifetimeAmount !== b.totalLifetimeAmount) {
			return b.totalLifetimeAmount - a.totalLifetimeAmount;
		}

		// Then by highest tier amount
		if (a.highestTierAmount !== b.highestTierAmount) {
			return b.highestTierAmount - a.highestTierAmount;
		}

		// Finally by creation date (newest first)
		return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
	});
}


export function getActiveMonthlySupporters(sponsors: ProcessedSponsor[]): ProcessedSponsor[] {
	return sponsors.filter(
		(sponsor) => sponsor.isCurrentlyActive && sponsor.currentMonthlyAmount > 0,
	);
}

export function getTotalMonthlySupport(sponsors: ProcessedSponsor[]): number {
	return getActiveMonthlySupporters(sponsors).reduce(
		(total, sponsor) => total + sponsor.currentMonthlyAmount,
		0,
	);
}

export function getTotalLifetimeSupport(sponsors: ProcessedSponsor[]): number {
	return sponsors.reduce(
		(total, sponsor) => total + sponsor.totalLifetimeAmount,
		0,
	);
}

export function getTopSponsorsByLifetimeAmount(
	sponsors: ProcessedSponsor[],
	limit = 10,
): ProcessedSponsor[] {
	return [...sponsors]
		.sort((a, b) => b.totalLifetimeAmount - a.totalLifetimeAmount)
		.slice(0, limit);
}

export function getSponsorsWithMultipleContributions(sponsors: ProcessedSponsor[]): ProcessedSponsor[] {
	return sponsors.filter((sponsor) => sponsor.transactionCount > 1);
}

export function getCountryDistribution(sponsors: ProcessedSponsor[]): Record<string, number> {
	const distribution: Record<string, number> = {};

	sponsors.forEach((sponsor) => {
		sponsor.countries.forEach((country) => {
			distribution[country] = (distribution[country] || 0) + 1;
		});
	});

	return distribution;
}

export function getRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays === 0) return "today";
	if (diffDays === 1) return "yesterday";
	if (diffDays < 7) return `${diffDays} days ago`;
	if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
	if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
	return `${Math.floor(diffDays / 365)} years ago`;
}

export function getSponsorTierInfo(sponsor: ProcessedSponsor): {
	primaryTier: string;
	allTiers: string[];
	hasMultipleTiers: boolean;
	isRecurring: boolean;
} {
	return {
		primaryTier: sponsor.tierName,
		allTiers: sponsor.allTierNames,
		hasMultipleTiers: sponsor.allTierNames.length > 1,
		isRecurring: sponsor.hasRecurringTiers,
	};
}


export function calculateLifetimeContribution(entry: ProcessedSponsor): number {
	return entry.totalLifetimeAmount;
}
