import { validateEnv } from "./lib/env";

export function register() {
  try {
    validateEnv();
  } catch (error) {
    // Melempar error di sini membuat Next tetap hidup dalam keadaan rusak; keluar tegas lebih jelas untuk operator dan healthcheck.
    console.error((error as Error).message);
    process.exit(1);
  }
}
