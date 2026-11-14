// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfigFromFile } from "vite";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function devApiRewrite(): Promise<(requestPath: string) => string> {
  const loaded = await loadConfigFromFile(
    { command: "serve", mode: "development" },
    path.join(frontendRoot, "vite.config.ts"),
    frontendRoot,
  );
  const proxy = loaded?.config.server?.proxy;
  const api = proxy && !Array.isArray(proxy) ? proxy["/api"] : undefined;
  const rewrite = api && typeof api !== "string" ? api.rewrite : undefined;
  if (!rewrite) {
    throw new Error("vite dev server does not rewrite /api");
  }

  return rewrite;
}

describe("dev and production API paths", () => {
  it("forwards /api/course to the Express /course route in dev and production", async () => {
    const devPath = (await devApiRewrite())("/api/course");
    const vercel = JSON.parse(readFileSync(path.join(frontendRoot, "vercel.json"), "utf8")) as {
      rewrites: Array<{ source: string; destination: string }>;
    };
    const rewrite = vercel.rewrites.find((rule) => rule.source === "/api/:path*");
    const destination = new URL((rewrite?.destination ?? "https://invalid.example/").replace(":path*", "course"));

    expect(devPath).toBe("/course");
    expect(destination.pathname).toBe("/course");
    expect(destination.hostname).toBe("triton-schedule-alpha.vercel.app");
  });
});
