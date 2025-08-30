# Sponsorkit

Clean GitHub sponsorship data processing and banner generation with intelligent categorization.

## 🎯 Overview

The system takes raw GitHub sponsorship export data and categorizes sponsors into three tiers:
- **Special Sponsors** (80px avatars) - High-value supporters
- **Current Sponsors** (60px avatars) - Active supporters  
- **Past Sponsors** (40px avatars) - Previous supporters

## 📊 Sponsor Categorization Logic

### Special Sponsors (80px avatars)
Sponsors are categorized as "Special" if they meet any of these criteria:

1. **Recurring High-Value Sponsors**: Have a `$100+` monthly tier (recurring payments)
2. **Very High-Value One-Time Sponsors**: Contributed `$400+` in one-time payments
3. **Recent High-Value One-Time Sponsors**: Contributed `$100+` within the last 30 days

**Examples:**
- Novu: `$100/month` recurring → Special
- Steven Tey: `$421` one-time → Special (≥$400)
- Felipe Valencia: `$100` one-time (7 days ago) → Special (≥$100 within 30 days)

### Current Sponsors (60px avatars)
Sponsors are categorized as "Current" if they are:

1. **Active Recurring Sponsors**: Have monthly/yearly subscriptions with recent activity
   - Monthly sponsors: Active if last transaction ≤ 60 days ago
   - Yearly sponsors: Active if last transaction ≤ 365 days ago
2. **Recent One-Time Sponsors**: Made any one-time contribution within the last 30 days

**Examples:**
- Bapusaheb Patil: `$20/month` recurring, active → Current
- Ahmed Elsakaan: `$5/month` yearly, active → Current
- Mateus Santana: `$5` one-time (today) → Current (within 30 days)

### Past Sponsors (40px avatars)
Sponsors are categorized as "Past" if they are:

1. **Inactive Recurring Sponsors**: Had subscriptions but no recent activity
2. **Old One-Time Sponsors**: Made one-time contributions more than 30 days ago

**Examples:**
- Igor Belogurov: `$10` one-time (100 days ago) → Past
- Better Stack: `$100` one-time (31 days ago) → Past

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

# Process and upload to R2
bun run scripts/process-sponsors.ts --yes
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
    "total_sponsors": 33,
    "total_lifetime_amount": 1729.23,
    "total_current_monthly": 242,
    "special_sponsors": 7,
    "current_sponsors": 11,
    "past_sponsors": 15
  },
  "specialSponsors": [
    {
      "name": "Steven Tey",
      "githubId": "steven-tey",
      "avatarUrl": "https://avatars.githubusercontent.com/steven-tey",
      "websiteUrl": null,
      "githubUrl": "https://github.com/steven-tey",
      "tierName": "$421 one time",
      "totalProcessedAmount": 421,
      "sinceWhen": "since Jun 2025",
      "transactionCount": 1,
      "formattedAmount": "$421.00"
    }
  ],
  "sponsors": [/* Current sponsors array */],
  "pastSponsors": [/* Past sponsors array */]
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

// Display summary stats
console.log(`Total: ${data.summary.total_sponsors} sponsors`);
console.log(`Lifetime: $${data.summary.total_lifetime_amount}`);

// Example: Display a sponsor card
specialSponsors.forEach(sponsor => {
  console.log(`${sponsor.name} - ${sponsor.formattedAmount} ${sponsor.sinceWhen}`);
  // Output: "Steven Tey - $421.00 since Jun 2025"
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
- `$400+` one-time for special sponsors
- `$100+` recurring or recent one-time for special sponsors
- `30 days` threshold for recent classification
- `60 days` for monthly sponsor activity
- `365 days` for yearly sponsor activity

### Banner Styling
Customize appearance in `scripts/generate-sponsors.ts`:
- Avatar sizes (80px, 60px, 40px)
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
- Tier amounts use `tier_monthly_amount` for categorization
- Activity based on `transaction_date` vs current date
- Only public sponsors with settled transactions included
