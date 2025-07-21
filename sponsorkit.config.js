import { defineConfig, tierPresets } from "sponsorkit";

export default defineConfig({
  github: {
    login: "amanvarshney01",
    type: "user",
  },
  includePastSponsors: true,
  force: true,
  renderer: "circles",
});
