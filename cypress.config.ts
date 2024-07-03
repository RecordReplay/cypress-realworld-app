import { execSync } from "node:child_process";
import path from "path";
import _ from "lodash";
import axios from "axios";
import dotenv from "dotenv";
import Promise from "bluebird";
import codeCoverageTask from "@cypress/code-coverage/task";
import { devServer } from "@cypress/vite-dev-server";
import { defineConfig } from "cypress";
import { mergeConfig, loadEnv } from "vite";
import { plugin as replayPlugin, wrapOn } from "@replayio/cypress";
import { listAllRecordings } from "@replayio/replay";

dotenv.config({ path: ".env.local" });
dotenv.config();

const graphqlUrl = "https://api.replay.io/v1/graphql";

let awsConfig = {
  default: undefined,
};

try {
  awsConfig = require(path.join(__dirname, "./aws-exports-es5.js"));
} catch (e) {}

module.exports = defineConfig({
  projectId: "7s5okt",
  retries: {
    runMode: 2,
  },
  env: {
    apiUrl: "http://localhost:3001",
    mobileViewportWidthBreakpoint: 414,
    coverage: false,
    codeCoverage: {
      url: "http://localhost:3001/__coverage__",
      exclude: "cypress/**/*.*",
    },
    defaultPassword: process.env.SEED_DEFAULT_USER_PASSWORD,
    paginationPageSize: process.env.PAGINATION_PAGE_SIZE,

    // Auth0
    auth0_username: process.env.AUTH0_USERNAME,
    auth0_password: process.env.AUTH0_PASSWORD,
    auth0_domain: process.env.VITE_AUTH0_DOMAIN,

    // Okta
    okta_username: process.env.OKTA_USERNAME,
    okta_password: process.env.OKTA_PASSWORD,
    okta_domain: process.env.VITE_OKTA_DOMAIN,
    okta_client_id: process.env.VITE_OKTA_CLIENTID,
    okta_programmatic_login: process.env.OKTA_PROGRAMMATIC_LOGIN || false,

    // Amazon Cognito
    cognito_username: process.env.AWS_COGNITO_USERNAME,
    cognito_password: process.env.AWS_COGNITO_PASSWORD,
    cognito_domain: process.env.AWS_COGNITO_DOMAIN,
    cognito_programmatic_login: false,
    awsConfig: awsConfig.default,

    // Google
    googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    googleClientId: process.env.VITE_GOOGLE_CLIENTID,
    googleClientSecret: process.env.VITE_GOOGLE_CLIENT_SECRET,
  },
  component: {
    devServer(devServerConfig) {
      const viteConfig = require("./vite.config.ts");
      const conf = {
        define: {
          "process.env": loadEnv("development", process.cwd(), "VITE"),
        },
        server: {
          /**
           * start the CT dev server on a different port than the full RWA
           * so users can switch between CT and E2E testing without having to
           * stop/start the RWA dev server.
           */
          port: 3002,
        },
      };

      const resolvedViteConfig = mergeConfig(viteConfig, conf);
      return devServer({
        ...devServerConfig,
        framework: "react",
        viteConfig: resolvedViteConfig,
      });
    },
    specPattern: "src/**/*.cy.{js,jsx,ts,tsx}",
    supportFile: "cypress/support/component.ts",
    setupNodeEvents(on, config) {
      codeCoverageTask(on, config);
      return config;
    },
  },
  e2e: {
    baseUrl: "http://localhost:3000",
    specPattern: "cypress/tests/**/*.spec.{js,jsx,ts,tsx}",
    supportFile: "cypress/support/e2e.ts",
    viewportHeight: 1000,
    viewportWidth: 1280,
    experimentalRunAllSpecs: true,
    setupNodeEvents(cyOn, config) {
      const testDataApiEndpoint = `${config.env.apiUrl}/testData`;

      const on = wrapOn(cyOn);

      let runTitle: string | undefined = undefined;
      if (process.env.CI || process.env.REACT_VERSION) {
        const commitTitle = execSync(`git log -1 --pretty="format:%s"`).toString().trim();
        const reactVersion = process.env.REACT_VERSION!;
        runTitle = `${commitTitle} (React ${reactVersion})`;

        console.log("Commit title: ", commitTitle, "run title: ", runTitle);
        process.env.RECORD_REPLAY_METADATA_SOURCE_COMMIT_TITLE = runTitle;
        const commitHash = process.env.GITHUB_SHA!;
        const runId = `${commitHash}-${reactVersion}`;
        // Force the UI to treat these as separate runs
        process.env.REPLAY_METADATA_TEST_RUN_ID = runId;
      }

      function delay(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      const newRecordings = new Set();
      const uploadedRecordings = new Set();

      async function waitForUploadedRecording(recordingId: string) {
        let start = Date.now();

        console.log("Starting upload check for recordingId: ", recordingId);

        while (true) {
          const now = Date.now();
          if (now - start > 300000) {
            throw new Error("Recording did not upload within 5 minutes");
          }
          const recordingEntries = listAllRecordings({ all: true });
          const recordingEntry = recordingEntries.find((entry) => entry.id === recordingId)!;

          console.log("Recording status: ", recordingEntry.id, recordingEntry.status);
          if (recordingEntry.status === "uploaded" || recordingEntry.status === "startedUpload") {
            uploadedRecordings.add(recordingId);
            console.log(new Date(), "Making replay public for recordingId: ", recordingId);
            await makeReplayPublic(process.env.REPLAY_API_KEY!, recordingId);
            console.log(new Date(), "Replay made public for recordingId: ", recordingId);
            break;
          } else {
            await delay(100);
          }
        }
      }

      on("after:spec", async (afterSpec) => {
        const recordingEntries = listAllRecordings({ all: true });

        for (const recordingEntry of recordingEntries) {
          if (!newRecordings.has(recordingEntry.id)) {
            newRecordings.add(recordingEntry.id);
            waitForUploadedRecording(recordingEntry.id);
          }
        }
      });

      replayPlugin(on, config, {
        upload: true, // automatically upload your replays to DevTools

        apiKey: process.env.REPLAY_API_KEY,
        runTitle,
      });

      const queryDatabase = ({ entity, query }, callback) => {
        const fetchData = async (attrs) => {
          const { data } = await axios.get(`${testDataApiEndpoint}/${entity}`);
          return callback(data, attrs);
        };

        return Array.isArray(query) ? Promise.map(query, fetchData) : fetchData(query);
      };

      on("task", {
        async "db:seed"() {
          // seed database with test data
          const { data } = await axios.post(`${testDataApiEndpoint}/seed`);
          return data;
        },

        // fetch test data from a database (MySQL, PostgreSQL, etc...)
        "filter:database"(queryPayload) {
          return queryDatabase(queryPayload, (data, attrs) => _.filter(data.results, attrs));
        },
        "find:database"(queryPayload) {
          return queryDatabase(queryPayload, (data, attrs) => _.find(data.results, attrs));
        },
      });

      codeCoverageTask(on, config);
      return config;
    },
  },
});

async function makeReplayPublic(apiKey: string, recordingId: string) {
  const variables = {
    recordingId: recordingId,
    isPrivate: false,
  };

  return axios({
    url: graphqlUrl,
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    data: {
      query: `
        mutation MakeReplayPublic($recordingId: ID!, $isPrivate: Boolean!) {
          updateRecordingPrivacy(input: { id: $recordingId, private: $isPrivate }) {
            success
          }
        }
      `,
      variables,
    },
  }).catch((e) => {
    console.error(e, variables);
  });
}
