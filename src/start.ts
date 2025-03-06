import { spawn } from "child_process";
import {
  saveState,
  info,
  setFailed,
  debug,
  exportVariable,
  warning,
} from "@actions/core";
import { resolve } from "path";
import { waitUntilUsed } from "tcp-port-used";
import { existsSync, mkdirSync } from "fs";
import { logDir } from "./constants";
import {
  attempts,
  host,
  storagePath,
  storageProvider,
  teamId,
  token,
} from "./inputs";
import { getPort } from "./getPort";

async function main() {
  if (!existsSync(logDir)) {
    debug(`Creating log directory: "${logDir}"...`);
    mkdirSync(logDir, { recursive: true });
  }

  const port = await getPort();

  debug(`Export environment variables...`);
  exportVariable("TURBO_API", `${host}:${port}`);
  exportVariable("TURBO_TOKEN", token);
  exportVariable("TURBO_TEAM", teamId);

  debug(`Starting Turbo Cache Server...`);
  const subprocess = spawn("node", [resolve(__dirname, "../start_and_log")], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PORT: port.toString(),
      TURBO_TOKEN: token,
      STORAGE_PROVIDER: storageProvider,
      STORAGE_PATH: storagePath,
    },
  });

  const pid = subprocess.pid?.toString();
  subprocess.unref();

  try {
    debug(`Waiting for port ${port} to be used...`);
    await waitUntilUsed(port, 250, 5000);

    info("Spawned Turbo Cache Server:");
    info(`  PID: ${pid}`);
    info(`  Listening on port: ${port}`);
    saveState("pid", subprocess.pid?.toString());
  } catch (e) {
    throw new Error(`Turbo server failed to start on port: ${port}`);
  }
}

const retry = async (attempts: number, fn: () => Promise<void>) => {
  let attempt = 0;
  while (attempt < attempts) {
    try {
      await fn();
    } catch (e) {
      warning(e as Error);
    }
    attempt++;
  }

  throw new Error(`Turbo server failed to start after ${attempts} attempts!`);
};

retry(attempts, main).catch(setFailed);
