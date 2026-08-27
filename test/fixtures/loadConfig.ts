import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { Logger } from "../util/logger";
import { Config, DEFAULTS, ConfigSchema } from "./defaults";

const logger = new Logger("config");

/**
 * Loads the user's configuration from <dir>/config.json,
 * validates it, and merges it with the built-in defaults.
 *
 * @param dir - Directory that contains the config file.
 * @returns The merged configuration object.
 * @throws TypeError If dir is not a non-empty string.
 */
export async function loadConfig(dir: string): Promise<Config> {
  // Validate input
  if (dir === null || dir === undefined) {
    throw new TypeError("dir must not be null or undefined");
  }
  if (typeof dir !== "string" || dir.trim().length === 0) {
    throw new TypeError("dir must be a non-empty string");
  }

  const file = path.join(dir, "config.json");

  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      logger.debug("no config at " + file + ", using defaults");
      return DEFAULTS;
    }
    logger.error("failed to read " + file, err);
    throw err;
  }

  const parsed = ConfigSchema.parse(JSON.parse(raw));
  return { ...DEFAULTS, ...parsed };
}
