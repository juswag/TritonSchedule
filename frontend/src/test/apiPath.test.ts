import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function devApiRewrite(): (requestPath: string) => string {
  const source = readFileSync(path.join(frontendRoot, "vite.config.ts"), "utf8");
  const match = source.match(/rewrite:\s*\(requestPath\)\s*=>\s*(requestPath\.replace\([^)]+\))/);
  if (!match) {
    throw new Error("vite.config.ts does not rewrite /api by replacing the prefix");
  }

  return new Function("requestPath", `return ${match[1]};`) as (requestPath: string) => string;
}

describe("dev and production API paths", () => {
  it("forwards /api/course to the Express /course route in dev and production", () => {
    const devPath = devApiRewrite()("/api/course");
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
