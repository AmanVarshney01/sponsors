import { config } from 'dotenv';
import { GraphQLClient, gql } from 'graphql-request';

// Load environment variables
config();

const GITHUB_TOKEN = process.env.SPONSORKIT_GITHUB_TOKEN;
const GITHUB_LOGIN = process.env.GITHUB_LOGIN || 'amanvarshney01';

if (!GITHUB_TOKEN) {
  console.error('❌ SPONSORKIT_GITHUB_TOKEN environment variable is required');
  console.log('Please create a .env file with your GitHub Personal Access Token');
  console.log('The token needs the "sponsor:read" scope');
  process.exit(1);
}

const client = new GraphQLClient('https://api.github.com/graphql', {
  headers: {
    authorization: `Bearer ${GITHUB_TOKEN}`,
  },
});

const SPONSORS_QUERY = gql`
  query GetSponsors($login: String!, $cursor: String) {
    user(login: $login) {
      sponsorshipsAsMaintainer(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          createdAt
          isActive
          privacyLevel
          sponsorEntity {
            ... on User {
              id
              login
              name
              avatarUrl
              url
              isHireable
              location
              company
              bio
              websiteUrl
              twitterUsername
              createdAt
              updatedAt
              databaseId
              email
              followers {
                totalCount
              }
              following {
                totalCount
              }
              repositories {
                totalCount
              }
              starredRepositories {
                totalCount
              }
              isViewer
              isFollowingViewer
              viewerIsFollowing
              viewerCanFollow
            }
            ... on Organization {
              id
              login
              name
              avatarUrl
              url
              location
              description
              websiteUrl
              twitterUsername
              createdAt
              updatedAt
              databaseId
              email
              membersWithRole {
                totalCount
              }
              repositories {
                totalCount
              }
              viewerCanAdminister
              viewerIsAMember
            }
          }
          tier {
            id
            name
            description
            monthlyPriceInDollars
            isOneTime
            isCustomAmount
            monthlyPriceInCents
          }
          sponsorable {
            ... on User {
              id
              login
              name
              avatarUrl
              url
            }
            ... on Organization {
              id
              login
              name
              avatarUrl
              url
            }
          }
        }
      }
    }
  }
`;

const PAST_SPONSORS_QUERY = gql`
  query GetPastSponsors($login: String!, $cursor: String) {
    user(login: $login) {
      sponsorshipsAsMaintainer(first: 100, after: $cursor, includePrivate: true) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          createdAt
          isActive
          privacyLevel
          sponsorEntity {
            ... on User {
              id
              login
              name
              avatarUrl
              url
              isHireable
              location
              company
              bio
              websiteUrl
              twitterUsername
              createdAt
              updatedAt
              databaseId
              email
              followers {
                totalCount
              }
              following {
                totalCount
              }
              repositories {
                totalCount
              }
              starredRepositories {
                totalCount
              }
              isViewer
              isFollowingViewer
              viewerIsFollowing
              viewerCanFollow
            }
            ... on Organization {
              id
              login
              name
              avatarUrl
              url
              location
              description
              websiteUrl
              twitterUsername
              createdAt
              updatedAt
              databaseId
              email
              membersWithRole {
                totalCount
              }
              repositories {
                totalCount
              }
              viewerCanAdminister
              viewerIsAMember
            }
          }
          tier {
            id
            name
            description
            monthlyPriceInDollars
            isOneTime
            isCustomAmount
            monthlyPriceInCents
          }
          sponsorable {
            ... on User {
              id
              login
              name
              avatarUrl
              url
            }
            ... on Organization {
              id
              login
              name
              avatarUrl
              url
            }
          }
        }
      }
    }
  }
`;

async function fetchAllSponsors(query, queryName) {
  let allSponsors = [];
  let hasNextPage = true;
  let cursor = null;

  console.log(`📊 Fetching ${queryName}...`);

  while (hasNextPage) {
    try {
      const variables = {
        login: GITHUB_LOGIN,
        cursor: cursor,
      };

      const data = await client.request(query, variables);
      const sponsorships = data.user.sponsorshipsAsMaintainer;

      allSponsors = allSponsors.concat(sponsorships.nodes);

      hasNextPage = sponsorships.pageInfo.hasNextPage;
      cursor = sponsorships.pageInfo.endCursor;

      console.log(`  ✅ Fetched ${sponsorships.nodes.length} sponsors (${allSponsors.length} total)`);

      // Add a small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));

    } catch (error) {
      console.error(`❌ Error fetching ${queryName}:`, error.message);
      if (error.response?.errors) {
        console.error('GraphQL errors:', error.response.errors);
      }
      break;
    }
  }

  return allSponsors;
}

async function main() {
  console.log(`🚀 Fetching GitHub sponsors for: ${GITHUB_LOGIN}`);
  console.log('');

  try {
    // Fetch active sponsors
    const activeSponsors = await fetchAllSponsors(SPONSORS_QUERY, 'active sponsors');

    // Fetch past sponsors (including private ones)
    const pastSponsors = await fetchAllSponsors(PAST_SPONSORS_QUERY, 'past sponsors');

    // Combine and deduplicate sponsors
    const allSponsorsMap = new Map();

    [...activeSponsors, ...pastSponsors].forEach(sponsorship => {
      const sponsorId = sponsorship.sponsorEntity.id;
      if (!allSponsorsMap.has(sponsorId)) {
        allSponsorsMap.set(sponsorId, sponsorship);
      }
    });

    const allSponsors = Array.from(allSponsorsMap.values());

    console.log('');
    console.log('📈 Summary:');
    console.log(`  • Active sponsors: ${activeSponsors.length}`);
    console.log(`  • Past sponsors: ${pastSponsors.length}`);
    console.log(`  • Total unique sponsors: ${allSponsors.length}`);

    // Group by tier
    const sponsorsByTier = {};
    allSponsors.forEach(sponsorship => {
      const tierName = sponsorship.tier?.name || 'No Tier';
      if (!sponsorsByTier[tierName]) {
        sponsorsByTier[tierName] = [];
      }
      sponsorsByTier[tierName].push(sponsorship);
    });

    console.log('');
    console.log('🏷️  Sponsors by tier:');
    Object.entries(sponsorsByTier).forEach(([tierName, sponsors]) => {
      console.log(`  • ${tierName}: ${sponsors.length} sponsors`);
    });

    // Save to JSON file
    const fs = await import('fs/promises');
    const outputData = {
      fetchedAt: new Date().toISOString(),
      login: GITHUB_LOGIN,
      activeSponsors: activeSponsors.length,
      pastSponsors: pastSponsors.length,
      totalSponsors: allSponsors.length,
      sponsorsByTier,
      sponsors: allSponsors,
    };

    await fs.writeFile('github-sponsors-data.json', JSON.stringify(outputData, null, 2));
    console.log('');
    console.log('💾 Data saved to: github-sponsors-data.json');

    // Display some sample sponsors
    console.log('');
    console.log('👥 Sample sponsors:');
    allSponsors.slice(0, 5).forEach((sponsorship, index) => {
      const sponsor = sponsorship.sponsorEntity;
      const tier = sponsorship.tier;
      console.log(`  ${index + 1}. ${sponsor.name || sponsor.login} (@${sponsor.login})`);
      console.log(`     Type: ${sponsor.__typename || 'Unknown'}`);
      console.log(`     Tier: ${tier?.name || 'No tier'} ($${tier?.monthlyPriceInDollars || 0}/month)`);
      console.log(`     Active: ${sponsorship.isActive ? 'Yes' : 'No'}`);
      console.log(`     Privacy: ${sponsorship.privacyLevel}`);
      console.log(`     Created: ${new Date(sponsorship.createdAt).toLocaleDateString()}`);
      if (sponsor.bio || sponsor.description) {
        const bio = sponsor.bio || sponsor.description;
        console.log(`     Bio: ${bio.substring(0, 100)}${bio.length > 100 ? '...' : ''}`);
      }
      if (sponsor.location) {
        console.log(`     Location: ${sponsor.location}`);
      }
      if (sponsor.company) {
        console.log(`     Company: ${sponsor.company}`);
      }
      if (sponsor.followers?.totalCount) {
        console.log(`     Followers: ${sponsor.followers.totalCount.toLocaleString()}`);
      }
      if (sponsor.membersWithRole?.totalCount) {
        console.log(`     Members: ${sponsor.membersWithRole.totalCount.toLocaleString()}`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main(); 