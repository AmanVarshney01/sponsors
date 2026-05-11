# Sponsor Rules

This document describes the rules used by `scripts/process-sponsors.ts` to turn a GitHub Sponsors export into `generated/sponsors.json`.

## Source Data

- The source file is `AmanVarshney01-sponsorships-all-time.json`.
- Only public sponsors are included. Private sponsors are intentionally excluded from public output and public summary totals.
- Only transactions with status `settled` or `credit_balance_adjusted` are counted.
- Sponsors with no valid public transactions are skipped.

## Amounts

- Lifetime totals use `processed_amount`, which is the amount actually processed.
- Tier/category decisions use `tier_monthly_amount`, which represents the sponsor's chosen tier. This keeps prorated first payments fair. For example, a new `$5/month` sponsor with a `$1.50` prorated first charge is still treated as a `$5/month` sponsor.
- Displayed totals are rounded to normal currency precision.
- Sponsor website URLs are normalized to absolute `http://` or `https://` URLs before they are written to generated JSON.

## Recurring Sponsors

A transaction is treated as recurring when its tier name contains one of these strings, case-insensitively:

- `a month`
- `monthly`
- `/month`

The active recurring tier is based on the latest recurring transaction.

Activity windows:

- Monthly recurring sponsors are active for `60 days` after the latest recurring transaction.
- Yearly recurring sponsors are active for `400 days` after the latest recurring transaction.

The yearly window intentionally includes a grace period beyond 365 days so yearly sponsors do not drop out immediately because of payment timing.

## Categories

Categories are assigned in this order: `special`, `current`, `backers`, then `past`.

### Special Sponsors

A sponsor is `special` when either rule is true:

- They have an active recurring tier of `$100/month` or more.
- They made an individual one-time contribution of `$100` or more and are still inside that contribution's special window.

One-time special window:

```text
special_days = floor(one_time_tier_amount / 100) * 30
```

Examples:

- `$100 one time` gets `30 days` of Special status.
- `$200 one time` gets `60 days` of Special status.
- `$421 one time` gets `120 days` of Special status.
- `$1,000 one time` gets `300 days` of Special status.

Once the window expires, the sponsor moves to `past` unless another rule keeps them current.

### Current Sponsors

A sponsor is `current` when they are not special and either rule is true:

- They have an active recurring tier of `$5/month` or more.
- They made a one-time contribution of `$5` or more within the last `30 days`.

Recent one-time support can make a supporter current even if they also have older recurring history.

### Backers

A supporter is a `backer` when they are below the normal sponsor threshold:

- Active recurring tier greater than `$0` and less than `$5/month`.
- One-time contribution greater than `$0` and less than `$5`.

Backers are still included in the generated output, but they are shown separately from Sponsors.

### Past Sponsors

A supporter is `past` when they have valid public sponsorship history but no active or recent rule currently applies.

Common cases:

- A monthly recurring sponsor whose latest recurring transaction is more than `60 days` old.
- A yearly recurring sponsor whose latest recurring transaction is more than `400 days` old.
- A `$5+` one-time sponsor whose latest one-time contribution is more than `30 days` old.
- A `$100+` one-time sponsor whose proportional Special window has expired.

## Display Tier

The `tierName` shown in generated JSON is chosen in this priority order:

- The recent special one-time tier, when the sponsor is Special because of a one-time contribution.
- The active recurring tier, when the sponsor is currently active recurring.
- The latest one-time tier, for one-time-only or inactive supporters.
- The highest tier amount as a fallback.

## Sorting

Sponsors are sorted by:

1. Category: `special`, `current`, `backers`, `past`
2. Total lifetime processed amount, highest first
3. Highest tier amount, highest first
4. Sponsorship creation date, newest first

This gives prominent placement to active support first, then to total contribution within each category.

## Generated Output

`generated/sponsors.json` contains:

- `specialSponsors`
- `sponsors`
- `backers`
- `pastSponsors`
- `summary`

Every sponsor entry includes:

- `name`
- `githubId`
- `avatarUrl`
- `websiteUrl`
- `githubUrl`
- `tierName`
- `sinceWhen`
- `transactionCount`
- `totalProcessedAmount`
- `formattedAmount`

## Fairness Principles

- Respect privacy first: private sponsors are not exposed.
- Recognize ongoing support: active recurring sponsors stay visible while their subscription is active.
- Recognize high-value one-time support proportionally: larger one-time gifts receive longer Special placement.
- Avoid over-counting expired one-time gifts: after the proportional window, one-time sponsors move to Past unless they support again.
- Keep small supporters visible: low-dollar supporters are included as Backers instead of being dropped.
