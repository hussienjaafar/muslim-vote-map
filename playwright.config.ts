import { createLovableConfig } from "lovable-agent-playwright-config/config";

export default createLovableConfig({
  // UX regression suite for the Issue Map lives in ./tests
  testDir: "./tests",
  // Issue Map pulls donor/state data over the network, so give actions room.
  timeout: 60000,
  use: {
    viewport: { width: 1440, height: 900 },
  },
});
