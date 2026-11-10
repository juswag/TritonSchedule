import "dotenv/config";
import { buildClassPlannerCatalog } from "./buildClassPlannerCatalog.js";
import { normalizeTerm, scrapeClassPlannerDetails } from "./scrapeClassPlanner.js";
import { replaceManualCatalogDetails } from "../services/supabaseRepository.js";

async function main() {
  const [termArg, mode, ...extra] = process.argv.slice(2);
  if (!termArg || (mode !== undefined && mode !== "--preview") || extra.length) {
    throw new Error("Usage: npm run ingest:details -- TERM [--preview]");
  }
  const term = normalizeTerm(termArg);
  const cookie = process.env.CLASS_PLANNER_SESSION_COOKIE;
  const { courses, routes } = await scrapeClassPlannerDetails(term, cookie ?? "");
  const catalog = buildClassPlannerCatalog(term, courses, routes);
  if (mode === "--preview") {
    const rooms = catalog.meetings.filter((m) => m.room_code || m.room_name);
    console.log(`Preview for ${term}: ${catalog.sections.length} sections, ${rooms.length} meetings with rooms, ${catalog.event_packages.length} event packages, ${catalog.module_routes.length} TSS booking links. No database writes.`);
    return;
  }
  await replaceManualCatalogDetails(term, catalog);
  console.log(`Imported ${term} details for ${catalog.sections.length} sections and ${catalog.event_packages.length} event packages, ${catalog.module_routes.length} TSS booking links.`);
}

main().catch((error: unknown) => {
  console.error("Manual catalog import failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
