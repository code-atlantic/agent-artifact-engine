import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { AppConfig } from "../src/core/config.js";
import { loadConfig } from "../src/core/config.js";
import { buildApp } from "../src/http/app.js";
import { FileArtifactStore } from "../src/storage/file-store.js";

async function makeTestApp(overrides: Partial<AppConfig> = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), "agent-artifact-engine-"));
  const config: AppConfig = {
    host: "127.0.0.1",
    port: 0,
    publicBaseUrl: "http://example.test",
    artifactBaseUrl: "http://example.test",
    dataDir,
    maxSourceBytes: 1024 * 1024,
    artifactAllowScripts: false,
    ...overrides
  };
  const app = buildApp({ config, store: new FileArtifactStore(dataDir) });

  return {
    app,
    dataDir,
    async cleanup() {
      await app.close();
      await rm(dataDir, { recursive: true, force: true });
    }
  };
}

describe("agent artifact engine", () => {
  it("publishes and renders a public artifact", async () => {
    const fixture = await makeTestApp();

    try {
      const response = await fixture.app.inject({
        method: "POST",
        url: "/v1/artifacts",
        payload: {
          title: "Launch Notes",
          format: "html",
          visibility: "public",
          tags: ["Launch", "Agent Output"],
          categories: ["Demo"],
          html: "<h1>Launch Notes</h1><p>Hello.</p>"
        }
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.artifact.slug).toBe("launch-notes");
      expect(body.urls.viewUrl).toBe("http://example.test/a/launch-notes");
      expect(body.share.url).toContain("http://example.test/s/");

      const view = await fixture.app.inject({ method: "GET", url: "/a/launch-notes" });
      expect(view.statusCode).toBe(200);
      expect(view.body).toContain("Launch Notes");

      const home = await fixture.app.inject({ method: "GET", url: "/" });
      expect(home.statusCode).toBe(200);
      expect(home.body).toContain("launch-notes");

      const tags = await fixture.app.inject({ method: "GET", url: "/v1/tags" });
      expect(tags.statusCode).toBe(200);
      expect(tags.json().tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ value: "launch" }),
          expect.objectContaining({ value: "agent-output" })
        ])
      );
    } finally {
      await fixture.cleanup();
    }
  });

  it("supports safe MDX without executing expressions", async () => {
    const fixture = await makeTestApp();

    try {
      const response = await fixture.app.inject({
        method: "POST",
        url: "/v1/artifacts",
        payload: {
          title: "MDX Brief",
          format: "mdx",
          visibility: "public",
          mdx: "# MDX Brief\n\n<Callout type=\"note\">Safe subset.</Callout>\n\n{dangerous}"
        }
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      const raw = await fixture.app.inject({ method: "GET", url: `/raw/${body.currentVersion.id}` });
      expect(raw.statusCode).toBe(200);
      expect(raw.body).toContain("MDX Brief");
      expect(raw.body).toContain("Safe subset.");
      expect(raw.body).not.toContain("dangerous");
    } finally {
      await fixture.cleanup();
    }
  });

  it("requires the optional publish token for writes and private reads", async () => {
    const fixture = await makeTestApp({ publishToken: "secret" });

    try {
      const denied = await fixture.app.inject({
        method: "POST",
        url: "/v1/artifacts",
        payload: { title: "Denied", html: "<h1>No</h1>" }
      });
      expect(denied.statusCode).toBe(401);

      const created = await fixture.app.inject({
        method: "POST",
        url: "/v1/artifacts",
        headers: { authorization: "Bearer secret" },
        payload: {
          title: "Private Note",
          format: "html",
          visibility: "private",
          html: "<h1>Private</h1>"
        }
      });
      expect(created.statusCode).toBe(201);
      const body = created.json();

      const rawDenied = await fixture.app.inject({ method: "GET", url: `/raw/${body.currentVersion.id}` });
      expect(rawDenied.statusCode).toBe(401);

      const rawAllowed = await fixture.app.inject({
        method: "GET",
        url: `/raw/${body.currentVersion.id}`,
        headers: { "x-publish-token": "secret" }
      });
      expect(rawAllowed.statusCode).toBe(200);
    } finally {
      await fixture.cleanup();
    }
  });

  it("uses Railway provided domain and volume defaults", () => {
    const config = loadConfig({
      PORT: "8080",
      RAILWAY_PUBLIC_DOMAIN: "agent-artifact-engine-production.up.railway.app",
      RAILWAY_VOLUME_MOUNT_PATH: "/data"
    });

    expect(config.publicBaseUrl).toBe("https://agent-artifact-engine-production.up.railway.app");
    expect(config.artifactBaseUrl).toBe("https://agent-artifact-engine-production.up.railway.app");
    expect(config.dataDir).toBe("/data");
  });
});
