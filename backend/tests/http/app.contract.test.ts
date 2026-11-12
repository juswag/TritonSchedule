import request from "supertest";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

type AppRole = "user" | "admin";
type AuthState = {
  authError: Error | null;
  roleError: Error | null;
  roles: Array<{ role: AppRole }>;
  user: { id: string } | null;
};

const authState: AuthState = {
  authError: null,
  roleError: null,
  roles: [{ role: "admin" }],
  user: { id: "admin-id" },
};

const mockGetActiveTermRow = jest.fn<() => Promise<any>>();
const mockPingDatabase = jest.fn<() => Promise<{ ok: 0 | 1 }>>();
const mockSearchCourses = jest.fn<(course: string, term: string) => Promise<any[]>>();
const mockSearchProfessor = jest.fn<(nameKey?: string) => Promise<any[]>>();

jest.unstable_mockModule("../../src/services/connectToDB.js", () => ({
  connectToDB: () => ({
    auth: {
      getUser: async () => ({
        data: { user: authState.user },
        error: authState.authError,
      }),
    },
    from: () => {
      const query: any = {
        eq: async () => ({ data: authState.roles, error: authState.roleError }),
        select: () => query,
      };

      return query;
    },
  }),
  pingDatabase: mockPingDatabase,
}));

jest.unstable_mockModule("../../src/services/supabaseRepository.js", () => ({
  getActiveTermRow: mockGetActiveTermRow,
  searchCourses: mockSearchCourses,
  searchProfessor: mockSearchProfessor,
}));

const { default: app } = await import("../../src/app.js");

const adminCookie = "auth=valid-admin-token";
const userCookie = "auth=valid-user-token";

function resetAuthState(overrides: Partial<AuthState> = {}) {
  authState.authError = null;
  authState.roleError = null;
  authState.roles = [{ role: "admin" }];
  authState.user = { id: "admin-id" };

  Object.assign(authState, overrides);
}

function expectHealthyHealthResponse(body: any) {
  expect(body.status).toBe("ok");
  expect(body.checks.server.ok).toBe(true);
  expect(body.checks.env.ok).toBe(true);
  expect(body.checks.database.ok).toBe(true);
  expect(typeof body.responseTimeMs).toBe("number");
  expect(typeof body.timestamp).toBe("string");
  expect(typeof body.uptimeSeconds).toBe("number");
}

describe("app HTTP contracts", () => {
  beforeEach(() => {
    resetAuthState();
    mockGetActiveTermRow.mockReset();
    mockPingDatabase.mockReset();
    mockSearchCourses.mockReset();
    mockSearchProfessor.mockReset();

    mockGetActiveTermRow.mockResolvedValue({ IsActive: true, Term: "FA25" });
    mockPingDatabase.mockResolvedValue({ ok: 1 });
    mockSearchCourses.mockResolvedValue([{ Name: "CSE 101", Term: "FA25" }]);
    mockSearchProfessor.mockResolvedValue([{ name: "jane doe", nameKey: "jane doe" }]);
  });

  it("When course search is requested then it returns matching courses", async () => {
    await request(app)
      .get("/course")
      .query({ course: "CSE 101", term: "FA25" })
      .expect(200, { data: [{ Name: "CSE 101", Term: "FA25" }] });
  });

  it("When an active term exists then the term endpoint returns it", async () => {
    await request(app)
      .get("/term")
      .expect(200, { Term: "FA25" });
  });

  it("When no active term exists then the term endpoint returns 404", async () => {
    mockGetActiveTermRow.mockResolvedValue(null);

    await request(app)
      .get("/term")
      .expect(404, { message: "No active term found" });
  });

  it("When auth cookie is missing then admin endpoints return 401", async () => {
    await request(app)
      .get("/rmp")
      .expect(401, { Message: "Not Authorized" });
  });

  it("When user is not admin then admin endpoints return 403", async () => {
    resetAuthState({ roles: [{ role: "user" }], user: { id: "user-id" } });

    await request(app)
      .get("/health")
      .set("Cookie", userCookie)
      .expect(403, { Message: "Forbidden" });
  });

  it("When admin searches professors then matching records are returned", async () => {
    await request(app)
      .get("/rmp")
      .query({ teacher: " Jane Doe! " })
      .set("Cookie", adminCookie)
      .expect(200, { Data: [{ name: "jane doe", nameKey: "jane doe" }] });
  });

  it("When admin searches for a missing professor then 404 is returned", async () => {
    mockSearchProfessor.mockResolvedValue([]);

    await request(app)
      .get("/rmp")
      .query({ teacher: "Missing Professor" })
      .set("Cookie", adminCookie)
      .expect(404, "Item not found");
  });

  it("When admin requests health then healthy status is returned", async () => {
    const response = await request(app)
      .get("/health")
      .set("Cookie", adminCookie)
      .expect(200);

    expectHealthyHealthResponse(response.body);
  });

  it("When database is unhealthy then health returns degraded status", async () => {
    mockPingDatabase.mockResolvedValue({ ok: 0 });

    const response = await request(app)
      .get("/health")
      .set("Cookie", adminCookie)
      .expect(503);

    expect(response.body.status).toBe("degraded");
    expect(response.body.checks.database.ok).toBe(false);
  });

  it("When the removed refresh endpoint is requested then it returns 404", async () => {
    await request(app)
      .get("/refresh")
      .expect(404);
  });
});
