import { defineConfig, tierPresets } from "sponsorkit";

export default defineConfig({
  github: {
    login: "amanvarshney01",
    type: "user",
  },
  includePastSponsors: true,
  prorateOnetime: true,
  tiers: [
    {
      title: "Past Sponsors",
      monthlyDollars: -1,
      preset: tierPresets.xs,
    },
    {
      title: "Sponsor",
      preset: tierPresets.medium,
    },
    {
      title: "Special Sponsor",
      monthlyDollars: 100,
      preset: tierPresets.xl,
    },
  ],
  force: true,
  renderer: "tiers",
});
