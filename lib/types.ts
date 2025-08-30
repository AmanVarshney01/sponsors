export interface Transaction {
	transaction_id: string;
	tier_name: string;
	tier_monthly_amount: string;
	processed_amount: string;
	is_prorated: boolean;
	status: string;
	transaction_date: string;
	billing_country: string;
	billing_region: string;
	vat: string | null;
}

export interface RawSponsor {
	sponsor_handle: string;
	sponsor_profile_name: string | null;
	sponsor_public_email: string | null;
	sponsorship_started_on: string;
	is_public: boolean;
	is_yearly: boolean;
	transactions: Transaction[];
	payment_source: string;
	metadata: Record<string, any>;
}

export interface ProcessedSponsor {
	sponsor: {
		login: string;
		name: string;
		avatarUrl: string;
		websiteUrl?: string | null;
		linkUrl: string;
		customLogoUrl?: string;
		type: string;
	};
	totalLifetimeAmount: number;
	currentMonthlyAmount: number;
	highestTierAmount: number;
	isOneTime: boolean;
	monthlyDollars: number;
	transactionCount: number;
	firstSponsorshipDate: string;
	latestTransactionDate: string;
	allTierNames: string[];
	tierName: string;
	isCurrentlyActive: boolean;
	daysSinceLastTransaction: number;
	category: "special" | "current" | "past";
	privacyLevel: string;
	createdAt: string;
	provider: string;
	countries: string[];
	hasRecurringTiers: boolean;
	recurringTierAmount: number;
}

export interface SponsorsData {
	generated_at: string;
	summary: {
		total_sponsors: number;
		total_lifetime_amount: number;
		total_current_monthly: number;
		special_sponsors: number;
		current_sponsors: number;
		past_sponsors: number;
		top_sponsor: {
			name: string;
			amount: number;
		} | null;
	};
	categories: {
		special: ProcessedSponsor[];
		current: ProcessedSponsor[];
		past: ProcessedSponsor[];
	};
	sponsors: ProcessedSponsor[];
}

export type SponsorEntry = ProcessedSponsor;
