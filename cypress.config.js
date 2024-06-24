import path from "path";
import _ from "lodash";
import axios from "axios";
import dotenv from "dotenv";
import Promise from "bluebird";
import { percyHealthCheck } from "@percy/cypress/task";
import codeCoverageTask from "@cypress/code-coverage/task";
import { defineConfig } from "cypress";
import { listAllRecordings } from "@replayio/replay";
import { writeFileSync } from "fs";
const { devServer } = require("@cypress/react/plugins/react-scripts");
const cypressReplay = require("@replayio/cypress");

dotenv.config({ path: ".env.local" });
dotenv.config();

const awsConfig = require(path.join(__dirname, "./aws-exports-es5.js"));

const graphqlServer = process.env.CI ? "https://api.replay.io" : "http://localhost:8087";
const graphqlUrl = `${graphqlServer}/v1/graphql`;

module.exports = defineConfig({
  projectId: "7s5okt",
  video: false,
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
    auth0_domain: process.env.REACT_APP_AUTH0_DOMAIN,
    auth0_audience: process.env.REACT_APP_AUTH0_AUDIENCE,
    auth0_scope: process.env.REACT_APP_AUTH0_SCOPE,
    auth0_client_id: process.env.REACT_APP_AUTH0_CLIENTID,
    auth0_client_secret: process.env.AUTH0_CLIENT_SECRET,
    auth_token_name: process.env.REACT_APP_AUTH_TOKEN_NAME,

    // Okta
    okta_username: process.env.OKTA_USERNAME,
    okta_password: process.env.OKTA_PASSWORD,
    okta_domain: process.env.REACT_APP_OKTA_DOMAIN,
    okta_client_id: process.env.REACT_APP_OKTA_CLIENTID,

    // Amazon Cognito
    cognito_username: process.env.AWS_COGNITO_USERNAME,
    cognito_password: process.env.AWS_COGNITO_PASSWORD,
    awsConfig: awsConfig.default,

    // Google
    googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    googleClientId: process.env.REACT_APP_GOOGLE_CLIENTID,
    googleClientSecret: process.env.REACT_APP_GOOGLE_CLIENT_SECRET,
  },
  component: {
    devServer,
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
    setupNodeEvents(on, config) {
      on = cypressReplay.wrapOn(on);

      // API key for a test suites workspace to upload to
      const apiKey = process.env.WORKSPACE_API_KEY;
      const shouldUploadManually = !process.env.CI;

      cypressReplay.default(on, config, {
        upload: true,
        apiKey: shouldUploadManually ? apiKey : process.env.REPLAY_API_KEY,
      });

      const newRecordings = new Set();
      const uploadedRecordings = new Set();

      function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
      }

      async function waitForUploadedRecording(recordingId) {
        let start = Date.now();

        console.log("Starting upload check for recordingId: ", recordingId);

        while (true) {
          const now = Date.now();
          if (now - start > 300000) {
            throw new Error("Recording did not upload within 5 minutes");
          }

          let recordingEntries = listAllRecordings({ all: true });
          let recordingEntry = recordingEntries.find((entry) => entry.id === recordingId);

          console.log("Recording status: ", recordingEntry.id, recordingEntry.status);
          if (recordingEntry.status === "uploaded" || recordingEntry.status === "startedUpload") {
            uploadedRecordings.add(recordingId);
            console.log(new Date(), "Making replay public for recordingId: ", recordingId);
            await makeReplayPublic(apiKey, recordingId);
            console.log(new Date(), "Replay made public for recordingId: ", recordingId);
            break;
          } else {
            await delay(100);
          }
        }
      }

      on("after:spec", async (afterSpec) => {
        if (!shouldUploadManually) {
          return;
        }

        const recordingEntries = listAllRecordings({ all: true });

        console.log("All recordings: ", recordingEntries);

        for (const recordingEntry of recordingEntries) {
          if (!newRecordings.has(recordingEntry.id)) {
            newRecordings.add(recordingEntry.id);
            waitForUploadedRecording(recordingEntry.id);
          }
        }
      });

      on("after:run", async (afterRun) => {
        const data = JSON.stringify(afterRun.totalDuration);
        const filename = "duration.json";
        writeFileSync(filename, data);
        console.log("cypress-json-results: wrote results to %s", filename);
      });

      const testDataApiEndpoint = `${config.env.apiUrl}/testData`;

      const queryDatabase = ({ entity, query }, callback) => {
        const fetchData = async (attrs) => {
          const { data } = await axios.get(`${testDataApiEndpoint}/${entity}`);
          return callback(data, attrs);
        };

        return Array.isArray(query) ? Promise.map(query, fetchData) : fetchData(query);
      };

      on("task", {
        percyHealthCheck,
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

function logError(e, variables) {
  if (e.response) {
    console.log("Parameters");
    console.log(JSON.stringify(variables, undefined, 2));
    console.log("Response");
    console.log(JSON.stringify(e.response.data, undefined, 2));
  }

  throw e.message;
}

async function makeReplayPublic(apiKey, recordingId) {
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
    logError(e, variables);
  });
}
