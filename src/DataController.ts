import { window, commands } from "vscode";
import { softwareGet, softwarePut, isResponseOk, softwarePost } from "./http/HttpClient";
import {
  getItem,
  setItem,
  launchWebUrl,
  logIt,
  getProjectCodeSummaryFile,
  getProjectContributorCodeSummaryFile,
  formatNumber,
  getRightAlignedTableHeader,
  getRowLabels,
  getTableHeader,
  getColumnHeaders,
  findFirstActiveDirectoryOrWorkspaceDirectory,
  getDailyReportSummaryFile,
  getAuthCallbackState,
  setAuthCallbackState,
  syncIntegrations,
  getIntegrations,
} from "./Util";
import { buildWebDashboardUrl } from "./menu/MenuManager";
import { DEFAULT_SESSION_THRESHOLD_SECONDS, SIGN_UP_LABEL } from "./Constants";
import { CommitChangeStats } from "./model/models";
import { clearSessionSummaryData } from "./storage/SessionSummaryData";
import { getTodaysCommits, getThisWeeksCommits, getYesterdaysCommits } from "./repo/GitUtil";
import { clearTimeDataSummary } from "./storage/TimeSummaryData";
import { SummaryManager } from "./managers/SummaryManager";
const { WebClient } = require("@slack/web-api");
const fileIt = require("file-it");
const moment = require("moment-timezone");

let userFetchTimeout = null;

export async function getUserRegistrationState(isIntegration = false) {
  const jwt = getItem("jwt");
  const auth_callback_state = getAuthCallbackState(false /*autoCreate*/);
  const switching_account = getItem("switching_account");
  const authType = getItem("authType");

  const api = "/users/plugin/state";

  const token = auth_callback_state ? auth_callback_state : jwt;

  let resp = await softwareGet("/users/plugin/state", token);

  let foundUser = !!(isResponseOk(resp) && resp.data && resp.data.user);
  let state = foundUser ? resp.data.state : "UNKNOWN";

  // Use the JWT to check if the user is available (tmp until server uses auth_callback_state for email accounts)
  const isEmailAuth = authType === "software" || authType === "email";
  if (state !== "OK" && isEmailAuth) {
    // use the jwt
    resp = await softwareGet(api, jwt);
    foundUser = !!(isResponseOk(resp) && resp.data && resp.data.user);
    state = foundUser ? resp.data.state : "UNKNOWN";
  }

  if (foundUser) {
    // set the jwt, name (email), and use the registration flag
    // to determine if they're logged in or not
    const user = resp.data.user;
    if (switching_account && user?.plugin_jwt === jwt) {
      return { loggedOn: false, state, user: null };
    }
    const registered = user.registered;

    // update the name and jwt if we're authenticating
    if (!isIntegration) {
      if (user.plugin_jwt) {
        setItem("jwt", user.plugin_jwt);
      }
      if (registered === 1) {
        setItem("name", user.email);
      }
    }

    const currentAuthType = getItem("authType");
    if (!currentAuthType) {
      setItem("authType", "software");
    }

    setItem("switching_account", false);
    setAuthCallbackState(null);

    // if we need the user it's "resp.data.user"
    return { loggedOn: registered === 1, state, user };
  }

  // all else fails, set false and UNKNOWN
  return { loggedOn: false, state, user: null };
}

export async function foundNewSlackIntegrations(user) {
  let foundNewIntegration = false;
  if (user && user.integrations) {
    const currentIntegrations = getIntegrations();
    // find the slack auth
    for (const integration of user.integrations) {
      // {access_token, name, plugin_uuid, scopes, pluginId, authId, refresh_token, scopes}
      if (integration.name.toLowerCase() === "slack" && integration.status.toLowerCase() === "active") {
        // check if it exists
        const foundIntegration = currentIntegrations.find((n) => n.authId === integration.authId);
        if (!foundIntegration) {
          // get the workspace domain using the authId
          const web = new WebClient(integration.access_token);
          const usersIdentify = await web.users.identity().catch((e) => {
            console.log("Error fetching slack team info: ", e.message);
            return null;
          });
          if (usersIdentify) {
            // usersIdentity returns
            // {team: {id, name, domain, image_102, image_132, ....}...}
            // set the domain
            integration["team_domain"] = usersIdentify.team?.domain;
            integration["team_name"] = usersIdentify.team?.name;
            integration["integration_id"] = usersIdentify.user?.id;
            // add it
            currentIntegrations.push(integration);

            foundNewIntegration = true;
          }
        }
      }
    }

    syncIntegrations(currentIntegrations);
  }
  return foundNewIntegration;
}

export async function getUser() {
  let api = `/users/me`;
  let resp = await softwareGet(api, getItem("jwt"));
  if (isResponseOk(resp)) {
    if (resp && resp.data && resp.data.data) {
      const user = resp.data.data;
      if (user.registered === 1) {
        // update jwt to what the jwt is for this spotify user
        setItem("name", user.email);
      }
      return user;
    }
  }
  return null;
}

export async function initializePreferences() {
  let jwt = getItem("jwt");
  // use a default if we're unable to get the user or preferences
  let sessionThresholdInSec = DEFAULT_SESSION_THRESHOLD_SECONDS;

  // enable Git by default
  let disableGitData = false;

  if (jwt) {
    let user = await getUser();
    if (user && user.preferences) {
      // obtain the session threshold in seconds "sessionThresholdInSec"
      sessionThresholdInSec = user.preferences.sessionThresholdInSec || DEFAULT_SESSION_THRESHOLD_SECONDS;

      disableGitData = !!user.preferences.disableGitData;
    }
  }

  // update values config
  setPreference("sessionThresholdInSec", sessionThresholdInSec);
  setPreference("disableGitData", disableGitData);
}

export function setPreference(preference: string, value) {
  return setItem(preference, value);
}

export function getPreference(preference: string) {
  return getItem(preference);
}

async function sendPreferencesUpdate(userId, userPrefs) {
  let api = `/users/${userId}`;
  // update the preferences
  // /:id/preferences
  api = `/users/${userId}/preferences`;
  let resp = await softwarePut(api, userPrefs, getItem("jwt"));
  if (isResponseOk(resp)) {
    logIt("update user code time preferences");
  }
}

export async function updatePreferences() {
  // get the user's preferences and update them if they don't match what we have
  let jwt = getItem("jwt");
  if (jwt) {
    let user = await getUser();
    if (!user) {
      return;
    }
    let api = `/users/${user.id}`;
    let resp = await softwareGet(api, jwt);
    if (isResponseOk(resp)) {
      if (resp && resp.data && resp.data.data && resp.data.data.preferences) {
        let prefs = resp.data.data.preferences;
        await sendPreferencesUpdate(parseInt(user.id, 10), prefs);
      }
    }
  }
}

export function refetchUserStatusLazily(tryCountUntilFoundUser = 50, interval = 10000) {
  if (userFetchTimeout) {
    return;
  }
  userFetchTimeout = setTimeout(() => {
    userFetchTimeout = null;
    userStatusFetchHandler(tryCountUntilFoundUser, interval);
  }, interval);
}

async function userStatusFetchHandler(tryCountUntilFoundUser, interval) {
  const state = await getUserRegistrationState();
  if (!state.loggedOn) {
    // try again if the count is not zero
    if (tryCountUntilFoundUser > 0) {
      tryCountUntilFoundUser -= 1;
      refetchUserStatusLazily(tryCountUntilFoundUser, interval);
    } else {
      // clear the auth callback state
      setItem("switching_account", false);
      setAuthCallbackState(null);
    }
  } else {
    // clear the auth callback state
    setItem("switching_account", false);
    setAuthCallbackState(null);

    clearSessionSummaryData();
    clearTimeDataSummary();

    SummaryManager.getInstance().updateSessionSummaryFromServer();

    // clear the integrations
    syncIntegrations([] /*empty array*/);

    // update this users integrations
    await foundNewSlackIntegrations(state.user);

    const message = "Successfully logged on to Code Time";
    window.showInformationMessage(message);

    commands.executeCommand("codetime.refreshTreeViews");

    initializePreferences();
  }
}

export async function launchWebDashboard() {
  if (!getItem("name")) {
    window
      .showInformationMessage(
        "Sign up or log in to see more data visualizations.",
        {
          modal: true,
        },
        SIGN_UP_LABEL
      )
      .then(async (selection) => {
        if (selection === SIGN_UP_LABEL) {
          commands.executeCommand("codetime.signUpAccount");
        }
      });
    return;
  }

  let webUrl = await buildWebDashboardUrl();

  // add the token=jwt
  const jwt = getItem("jwt");
  const encodedJwt = encodeURIComponent(jwt);
  webUrl = `${webUrl}?token=${encodedJwt}`;

  launchWebUrl(webUrl);
}

export async function writeDailyReportDashboard(type = "yesterday", projectIds = []) {
  let dashboardContent = "";

  const file = getDailyReportSummaryFile();
  fileIt.writeContentFileSync(file, dashboardContent);
}

export async function writeProjectCommitDashboardByStartEnd(start, end, project_ids) {
  const api = `/v1/user_metrics/project_summary`;
  const result = await softwarePost(api, { project_ids, start, end }, getItem("jwt"));
  await writeProjectCommitDashboard(result);
}

export async function writeProjectCommitDashboardByRangeType(type = "lastWeek", project_ids) {
  project_ids = project_ids.filter((n) => n);
  const api = `/v1/user_metrics/project_summary`;
  const result = await softwarePost(api, { project_ids, time_range: type }, getItem("jwt"));
  await writeProjectCommitDashboard(result);
}

export async function writeProjectCommitDashboard(apiResult) {
  let dashboardContent = "";
  // [{projectId, name, identifier, commits, files_changed, insertions, deletions, hours,
  //   keystrokes, characters_added, characters_deleted, lines_added, lines_removed},...]
  if (isResponseOk(apiResult)) {
    dashboardContent = apiResult.data;
  } else {
    dashboardContent += "No data available\n";
  }

  const file = getProjectCodeSummaryFile();
  fileIt.writeContentFileSync(file, dashboardContent);
}

export async function writeProjectContributorCommitDashboardFromGitLogs(identifier) {
  const activeRootPath = findFirstActiveDirectoryOrWorkspaceDirectory();

  const userTodaysChangeStatsP: Promise<CommitChangeStats> = getTodaysCommits(activeRootPath);
  const userYesterdaysChangeStatsP: Promise<CommitChangeStats> = getYesterdaysCommits(activeRootPath);
  const userWeeksChangeStatsP: Promise<CommitChangeStats> = getThisWeeksCommits(activeRootPath);
  const contributorsTodaysChangeStatsP: Promise<CommitChangeStats> = getTodaysCommits(activeRootPath, false);
  const contributorsYesterdaysChangeStatsP: Promise<CommitChangeStats> = getYesterdaysCommits(activeRootPath, false);
  const contributorsWeeksChangeStatsP: Promise<CommitChangeStats> = getThisWeeksCommits(activeRootPath, false);

  let dashboardContent = "";

  const now = moment().unix();
  const formattedDate = moment.unix(now).format("ddd, MMM Do h:mma");
  dashboardContent = getTableHeader("PROJECT SUMMARY", ` (Last updated on ${formattedDate})`);
  dashboardContent += "\n\n";
  dashboardContent += `Project: ${identifier}`;
  dashboardContent += "\n\n";

  // TODAY
  let projectDate = moment.unix(now).format("MMM Do, YYYY");
  dashboardContent += getRightAlignedTableHeader(`Today (${projectDate})`);
  dashboardContent += getColumnHeaders(["Metric", "You", "All Contributors"]);

  let summary = {
    activity: await userTodaysChangeStatsP,
    contributorActivity: await contributorsTodaysChangeStatsP,
  };
  dashboardContent += getRowNumberData(summary, "Commits", "commitCount");

  // files changed
  dashboardContent += getRowNumberData(summary, "Files changed", "fileCount");

  // insertions
  dashboardContent += getRowNumberData(summary, "Insertions", "insertions");

  // deletions
  dashboardContent += getRowNumberData(summary, "Deletions", "deletions");

  dashboardContent += "\n";

  // YESTERDAY
  projectDate = moment.unix(now).format("MMM Do, YYYY");
  let startDate = moment.unix(now).subtract(1, "day").startOf("day").format("MMM Do, YYYY");
  dashboardContent += getRightAlignedTableHeader(`Yesterday (${startDate})`);
  dashboardContent += getColumnHeaders(["Metric", "You", "All Contributors"]);
  summary = {
    activity: await userYesterdaysChangeStatsP,
    contributorActivity: await contributorsYesterdaysChangeStatsP,
  };
  dashboardContent += getRowNumberData(summary, "Commits", "commitCount");

  // files changed
  dashboardContent += getRowNumberData(summary, "Files changed", "fileCount");

  // insertions
  dashboardContent += getRowNumberData(summary, "Insertions", "insertions");

  // deletions
  dashboardContent += getRowNumberData(summary, "Deletions", "deletions");

  dashboardContent += "\n";

  // THIS WEEK
  projectDate = moment.unix(now).format("MMM Do, YYYY");
  startDate = moment.unix(now).startOf("week").format("MMM Do, YYYY");
  dashboardContent += getRightAlignedTableHeader(`This week (${startDate} to ${projectDate})`);
  dashboardContent += getColumnHeaders(["Metric", "You", "All Contributors"]);

  summary = {
    activity: await userWeeksChangeStatsP,
    contributorActivity: await contributorsWeeksChangeStatsP,
  };
  dashboardContent += getRowNumberData(summary, "Commits", "commitCount");

  // files changed
  dashboardContent += getRowNumberData(summary, "Files changed", "fileCount");

  // insertions
  dashboardContent += getRowNumberData(summary, "Insertions", "insertions");

  // deletions
  dashboardContent += getRowNumberData(summary, "Deletions", "deletions");

  dashboardContent += "\n";

  const file = getProjectContributorCodeSummaryFile();
  fileIt.writeContentFileSync(file, dashboardContent);
}

export async function writeProjectContributorCommitDashboard(identifier) {
  const qryStr = `?identifier=${encodeURIComponent(identifier)}`;
  const api = `/projects/contributorSummary${qryStr}`;
  const result = await softwareGet(api, getItem("jwt"));

  let dashboardContent = "";

  // [{timestamp, activity, contributorActivity},...]
  // the activity and contributorActivity will have the following structure
  // [{projectId, name, identifier, commits, files_changed, insertions, deletions, hours,
  //   keystrokes, characters_added, characters_deleted, lines_added, lines_removed},...]
  if (isResponseOk(result)) {
    const data = result.data;
    // create the title
    const now = moment().unix();
    const formattedDate = moment.unix(now).format("ddd, MMM Do h:mma");
    dashboardContent = getTableHeader("PROJECT SUMMARY", ` (Last updated on ${formattedDate})`);
    dashboardContent += "\n\n";
    dashboardContent += `Project: ${identifier}`;
    dashboardContent += "\n\n";

    for (let i = 0; i < data.length; i++) {
      const summary = data[i];
      let projectDate = moment.unix(now).format("MMM Do, YYYY");
      if (i === 0) {
        projectDate = `Today (${projectDate})`;
      } else if (i === 1) {
        let startDate = moment.unix(now).startOf("week").format("MMM Do, YYYY");
        projectDate = `This week (${startDate} to ${projectDate})`;
      } else {
        let startDate = moment.unix(now).startOf("month").format("MMM Do, YYYY");
        projectDate = `This month (${startDate} to ${projectDate})`;
      }
      dashboardContent += getRightAlignedTableHeader(projectDate);
      dashboardContent += getColumnHeaders(["Metric", "You", "All Contributors"]);

      // show the metrics now
      // const userHours = summary.activity.session_seconds
      //     ? humanizeMinutes(summary.activity.session_seconds / 60)
      //     : humanizeMinutes(0);
      // const contribHours = summary.contributorActivity.session_seconds
      //     ? humanizeMinutes(
      //           summary.contributorActivity.session_seconds / 60
      //       )
      //     : humanizeMinutes(0);
      // dashboardContent += getRowLabels([
      //     "Code time",
      //     userHours,
      //     contribHours
      // ]);

      // commits
      dashboardContent += getRowNumberData(summary, "Commits", "commits");

      // files changed
      dashboardContent += getRowNumberData(summary, "Files changed", "files_changed");

      // insertions
      dashboardContent += getRowNumberData(summary, "Insertions", "insertions");

      // deletions
      dashboardContent += getRowNumberData(summary, "Deletions", "deletions");
      dashboardContent += "\n";
    }

    dashboardContent += "\n";
  }

  const file = getProjectContributorCodeSummaryFile();
  fileIt.writeContentFileSync(file, dashboardContent);
}

function getRowNumberData(summary, title, attribute) {
  // files changed
  const userFilesChanged = summary.activity[attribute] ? formatNumber(summary.activity[attribute]) : formatNumber(0);
  const contribFilesChanged = summary.contributorActivity[attribute] ? formatNumber(summary.contributorActivity[attribute]) : formatNumber(0);
  return getRowLabels([title, userFilesChanged, contribFilesChanged]);
}

// start and end should be local_start and local_end
function createStartEndRangeByTimestamps(start, end) {
  return {
    rangeStart: moment.unix(start).utc().format("MMM Do, YYYY"),
    rangeEnd: moment.unix(end).utc().format("MMM Do, YYYY"),
  };
}

function createStartEndRangeByType(type = "lastWeek") {
  // default to "lastWeek"
  let startOf = moment().startOf("week").subtract(1, "week");
  let endOf = moment().startOf("week").subtract(1, "week").endOf("week");

  if (type === "yesterday") {
    startOf = moment().subtract(1, "day").startOf("day");
    endOf = moment().subtract(1, "day").endOf("day");
  } else if (type === "currentWeek") {
    startOf = moment().startOf("week");
    endOf = moment();
  } else if (type === "lastMonth") {
    startOf = moment().subtract(1, "month").startOf("month");
    endOf = moment().subtract(1, "month").endOf("month");
  }

  return {
    rangeStart: startOf.format("MMM Do, YYYY"),
    rangeEnd: endOf.format("MMM Do, YYYY"),
  };
}
