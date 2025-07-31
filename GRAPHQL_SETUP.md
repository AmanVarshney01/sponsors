# GitHub Sponsors GraphQL Setup

This script fetches all GitHub sponsors (both active and past) using the GitHub GraphQL API.

## Setup

### 1. Create a GitHub Personal Access Token

1. Go to [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens)
2. Click "Generate new token (classic)"
3. Give it a name like "SponsorKit GraphQL"
4. Select the following scopes:
   - `sponsor:read` - Required to read sponsor information
5. Click "Generate token"
6. Copy the token (you won't see it again!)

### 2. Create Environment File

Create a `.env` file in the root directory:

```bash
# GitHub Personal Access Token with sponsor:read scope
SPONSORKIT_GITHUB_TOKEN=your_github_personal_access_token_here

# GitHub username/organization to fetch sponsors for (optional, defaults to amanvarshney01)
GITHUB_LOGIN=amanvarshney01
```

### 3. Install Dependencies

```bash
bun install
```

## Usage

### Fetch All Sponsors

```bash
bun run fetch-sponsors
```

This will:
- Fetch all active sponsors
- Fetch all past sponsors (including private ones)
- Save the data to `github-sponsors-data.json`
- Display a summary and sample sponsors

### Output

The script creates a `github-sponsors-data.json` file with:
- Complete sponsor information (name, avatar, bio, etc.)
- Tier information (name, price, etc.)
- Sponsorship details (active status, creation date, etc.)
- Summary statistics

## GraphQL Queries Used

The script uses two main GraphQL queries:

1. **Active Sponsors**: Fetches current active sponsorships
2. **Past Sponsors**: Fetches all past sponsorships (including private ones)

Both queries include:
- Sponsor entity details (User/Organization)
- Tier information
- Sponsorship metadata
- Privacy settings

## Rate Limiting

The script includes a 100ms delay between requests to respect GitHub's rate limits.

## Troubleshooting

### "SPONSORKIT_GITHUB_TOKEN environment variable is required"
- Make sure you created the `.env` file
- Verify the token has the `sponsor:read` scope

### "Must have one of the following scopes: sponsor:read"
- Your token needs the `sponsor:read` scope
- Generate a new token with the correct permissions

### "Could not resolve to a User"
- Check that the `GITHUB_LOGIN` in your `.env` file is correct
- Make sure the user/organization exists and has sponsorships

## Data Structure

The output JSON contains comprehensive sponsor information based on the [GitHub GraphQL Sponsorship object](https://docs.github.com/en/graphql/reference/objects#sponsorship):

```json
{
  "fetchedAt": "2024-01-01T00:00:00.000Z",
  "login": "amanvarshney01",
  "activeSponsors": 10,
  "pastSponsors": 5,
  "totalSponsors": 15,
  "sponsorsByTier": {
    "Bronze": [...],
    "Silver": [...],
    "Gold": [...]
  },
  "sponsors": [
    {
      "id": "sponsorship-id",
      "createdAt": "2024-01-01T00:00:00Z",
      "isActive": true,
      "privacyLevel": "PUBLIC",
      "sponsorEntity": {
        "id": "user-id",
        "login": "sponsor-username",
        "name": "Sponsor Name",
        "avatarUrl": "...",
        "bio": "...",
        "location": "San Francisco, CA",
        "company": "Tech Corp",
        "websiteUrl": "https://example.com",
        "twitterUsername": "sponsor",
        "followers": { "totalCount": 1000 },
        "following": { "totalCount": 500 },
        "repositories": { "totalCount": 50 },
        "starredRepositories": { "totalCount": 200 },
        "databaseId": 12345,
        "email": "sponsor@example.com",
        "__typename": "User"
      },
      "tier": {
        "id": "tier-id",
        "name": "Bronze",
        "description": "Bronze tier benefits",
        "monthlyPriceInDollars": 5,
        "monthlyPriceInCents": 500,
        "isOneTime": false,
        "isCustomAmount": false
      },
      "sponsorable": {
        "id": "maintainer-id",
        "login": "amanvarshney01",
        "name": "Aman Varshney",
        "avatarUrl": "...",
        "url": "https://github.com/amanvarshney01"
      }
    }
  ]
}
```

### Enhanced Fields Available

Based on the GitHub GraphQL API, the script now fetches:

**Sponsorship Details:**
- `id`, `createdAt`, `isActive`, `privacyLevel`

**Sponsor Entity (User/Organization):**
- Basic info: `login`, `name`, `avatarUrl`, `bio`, `location`, `company`
- Social: `websiteUrl`, `twitterUsername`
- Stats: `followers`, `following`, `repositories`, `starredRepositories`
- Metadata: `databaseId`, `email`, `createdAt`, `updatedAt`
- Viewer context: `isViewer`, `viewerIsFollowing`, etc.

**Tier Information:**
- Pricing: `monthlyPriceInDollars`, `monthlyPriceInCents`
- Type: `isOneTime`, `isCustomAmount`
- Details: `name`, `description`

**Sponsorable (Maintainer):**
- Basic info about the person being sponsored 