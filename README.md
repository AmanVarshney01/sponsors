# Sponsorkit

Clean GitHub sponsorship data processing and banner generation with intelligent categorization.

## 🎯 Overview

The system takes raw GitHub sponsorship export data and categorizes public supporters into four tiers:
- **Special Sponsors** (100px avatars) - Active high-value recurring supporters and time-boxed high-value one-time supporters
- **Current Sponsors** (80px avatars) - Active recurring supporters and recent one-time supporters
- **Backers** (60px avatars) - Small supporters below the sponsor threshold
- **Past Sponsors** (40px avatars) - Previous supporters

## 📊 Sponsor Categorization Logic

For the full rulebook, see [`SPONSOR_RULES.md`](./SPONSOR_RULES.md).

### Special Sponsors (100px avatars)
Sponsors are categorized as "Special" if they meet any of these criteria:

1. **Active Recurring High-Value Sponsors**: Have an active `$100+` monthly recurring tier
2. **Time-Boxed High-Value One-Time Sponsors**: Made an individual `$100+` one-time contribution. The special window is `30 days` per full `$100`, so `$100` gets 30 days, `$200` gets 60 days, and `$400` gets 120 days.

**Examples:**
- Novu: `$100/month` recurring → Special
- Guillermo Rauch: `$1,000` one-time → Special for 300 days
- Steven Tey: `$421` one-time → Special for 120 days, then Past after that window

### Current Sponsors (80px avatars)
Sponsors are categorized as "Current" if they are:

1. **Active Recurring Sponsors**: Have monthly/yearly subscriptions with recent activity
   - Monthly sponsors: Active if last transaction ≤ 60 days ago
   - Yearly sponsors: Active if last transaction ≤ 400 days ago
2. **Recent One-Time Sponsors**: Made a `$5+` one-time contribution within the last 30 days

**Examples:**
- Shane Neubauer: `$10/month` yearly, active → Current
- Ahmed Elsakaan: `$5/month` yearly, active → Current
- Aarsh: `$10` one-time within 30 days → Current

### Backers (60px avatars)
Supporters are categorized as "Backers" if they are below the normal sponsor threshold:

1. **Small Active Recurring Supporters**: Active recurring tier below `$5/month`
2. **Small One-Time Supporters**: Most recent one-time contribution below `$5`

### Past Sponsors (40px avatars)
Supporters are categorized as "Past" if they are:

1. **Inactive Recurring Sponsors**: Had subscriptions but no recent activity
2. **Old One-Time Sponsors**: Made `$5+` one-time contributions more than 30 days ago
3. **Expired High-Value One-Time Sponsors**: Made `$100+` one-time contributions outside their proportional special window

**Examples:**
- Igor Belogurov: `$10` one-time (100 days ago) → Past
- Better Stack: `$100` one-time outside its 30-day special window → Past

## 🔄 Processing Flow

### 1. Data Processing (`scripts/process-sponsors.ts`)
- Reads GitHub sponsorship export JSON
- Filters for public sponsors with valid transactions
- Calculates lifetime contributions and activity status
- Applies categorization logic
- Generates structured `sponsors.json`

### 2. Banner Generation (`scripts/generate-sponsors.ts`)
- Reads processed sponsor data
- Creates SVG banner using Satori
- Organizes sponsors by category with appropriate sizing
- Outputs `sponsors.svg`

### 3. Upload (Optional)
- Uploads generated files to R2 storage
- Run with `--yes` flag to enable

## 🚀 Usage

```bash
# Process sponsorship data
bun run scripts/process-sponsors.ts

# Generate sponsor banner
bun run scripts/generate-sponsors.ts

# Process, generate SVG/PNG, and skip upload
bun run sponsors

# Process, generate SVG/PNG, and upload to R2
bun run sponsors --yes
```

## 📁 File Structure

```
├── AmanVarshney01-sponsorships-all-time.json  # GitHub export data
├── scripts/
│   ├── process-sponsors.ts                    # Data processing logic
│   ├── generate-sponsors.ts                   # SVG banner generation
│   └── upload-sponsorkit-to-r2.ts            # R2 upload utility
├── lib/
│   ├── types.ts                               # TypeScript definitions
│   └── utils.ts                               # Utility functions
├── generated/
│   ├── sponsors.json                          # Processed sponsor data
│   └── sponsors.svg                           # Generated banner
└── fonts/
    └── Inter-Regular.ttf                      # Font for SVG generation
```

## 🎨 UI-Optimized Data Structure

The generated `sponsors.json` is structured for easy web UI integration:

```json
{
  "generated_at": "2025-08-30T10:58:47.986Z",
  "summary": {
    "total_sponsors": 68,
    "total_lifetime_amount": 8319.87,
    "total_current_monthly": 556,
    "special_sponsors": 5,
    "current_sponsors": 11,
    "past_sponsors": 50,
    "backers": 2,
    "top_sponsor": {
      "name": "neondatabase",
      "amount": 1800
    }
  },
  "specialSponsors": [
    {
      "name": "Guillermo Rauch",
      "githubId": "rauchg",
      "avatarUrl": "https://avatars.githubusercontent.com/rauchg",
      "websiteUrl": null,
      "githubUrl": "https://github.com/rauchg",
      "tierName": "$1,000 one time",
      "totalProcessedAmount": 1000,
      "sinceWhen": "since Oct 2025",
      "transactionCount": 1,
      "formattedAmount": "$1,000.00"
    }
  ],
  "sponsors": [/* Current sponsors array */],
  "pastSponsors": [/* Past sponsors array */],
  "backers": [/* Backers array */]
}
```

### Key UI Fields:
- **`name`**: Display name
- **`githubId`**: GitHub username
- **`avatarUrl`**: Profile picture URL
- **`websiteUrl`**: Personal website (if available)
- **`githubUrl`**: GitHub profile URL
- **`tierName`**: Sponsorship tier name
- **`totalProcessedAmount`**: Total amount contributed
- **`formattedAmount`**: Pre-formatted currency string
- **`sinceWhen`**: Human-readable date (e.g., "since Jun 2025")
- **`transactionCount`**: Number of transactions

## 🌐 Web UI Integration

### Usage in Your Web App
```javascript
// Load sponsor data
const response = await fetch('./generated/sponsors.json');
const data = await response.json();

// Access categorized sponsors
const specialSponsors = data.specialSponsors;
const currentSponsors = data.sponsors;
const pastSponsors = data.pastSponsors;
const backers = data.backers;

// Display summary stats
console.log(`Total: ${data.summary.total_sponsors} sponsors`);
console.log(`Lifetime: $${data.summary.total_lifetime_amount}`);

// Example: Display a sponsor card
specialSponsors.forEach(sponsor => {
  console.log(`${sponsor.name} - ${sponsor.formattedAmount} ${sponsor.sinceWhen}`);
  // Output: "Guillermo Rauch - $1,000.00 since Oct 2025"
});
```

## 🎨 Banner Features

- **Responsive Layout**: Automatically adjusts rows based on sponsor count
- **Dynamic Sizing**: Different avatar sizes for each category
- **Clean Design**: Modern typography with Inter font
- **Organized Sections**: Clear separation between sponsor tiers
- **Optimized Dimensions**: 800px width with calculated height

## 📈 Key Metrics

The system tracks and displays:
- Total sponsors and lifetime contributions
- Current monthly recurring revenue
- Sponsor distribution across categories
- Top contributors and complex sponsors

## 🔧 Customization

### Categorization Thresholds
Modify these values in `scripts/process-sponsors.ts`:
- `$100+` active recurring for special sponsors
- `$100+` individual one-time support for time-boxed special recognition
- `30 days per $100` for one-time special recognition
- `30 days` threshold for recent classification
- `60 days` for monthly sponsor activity
- `400 days` for yearly sponsor activity

### Banner Styling
Customize appearance in `scripts/generate-sponsors.ts`:
- Avatar sizes (100px, 80px, 60px, 40px)
- Colors and typography
- Layout spacing and dimensions

## 🎯 Business Logic Summary

The categorization prioritizes:

1. **Recurring Support**: Monthly/yearly sponsors get preference for "current" status
2. **Recent Engagement**: Recent one-time sponsors are shown appreciation
3. **High Value**: Large contributions get special recognition
4. **Fair Representation**: All supporters are acknowledged appropriately

This creates a balanced system that:
- Rewards ongoing support (recurring sponsors)
- Appreciates recent contributions (recent one-time)
- Honors significant contributions (high-value sponsors)
- Maintains historical recognition (past sponsors)

## 📝 Notes

- All amounts calculated from `processed_amount` (actual received amount)
- Tier amounts use `tier_monthly_amount` for categorization, so prorated first payments still count by the chosen tier
- Activity based on `transaction_date` vs current date
- Only public sponsors with settled or credit-balance-adjusted transactions included
