import { makeTestDb } from "@meclaw/core/db/test-db";
import { recentAudit } from "@meclaw/core/settings";
import { describe, expect, it } from "vitest";
import {
  createEmbedClient,
  generatePublicToken,
  getEmbedClient,
  listActiveEmbedClients,
  listEmbedClients,
  revokeEmbedClient,
  updateEmbedClient,
} from "./embed-clients";

describe("embed-clients service", () => {
  it("generates a public token with pk_ prefix and 32 hex chars", () => {
    const token = generatePublicToken();
    expect(token).toMatch(/^pk_[0-9a-f]{32}$/);
    expect(token.length).toBe(35); // "pk_" (3) + 32 hex chars
  });

  it("creates an embed client and writes an audit row", async () => {
    const { db } = await makeTestDb();
    const client = await createEmbedClient(
      db,
      {
        name: "Acme Corp",
        allowedOrigins: ["https://acme.com"],
        rateLimitPerMin: 60,
      },
      "127.0.0.1",
    );
    expect(client.name).toBe("Acme Corp");
    expect(client.publicToken).toMatch(/^pk_[0-9a-f]{32}$/);
    expect(client.allowedOrigins).toEqual(["https://acme.com"]);
    expect(client.rateLimitPerMin).toBe(60);
    expect(client.revokedAt).toBeNull();

    const audit = await recentAudit(db, 10);
    expect(audit[0].action).toBe("embed_client.create");
  });

  it("lists all clients newest first", async () => {
    const { db } = await makeTestDb();
    const c1 = await createEmbedClient(db, { name: "First", allowedOrigins: [] }, "ip");
    await new Promise((r) => setTimeout(r, 10));
    const c2 = await createEmbedClient(db, { name: "Second", allowedOrigins: [] }, "ip");

    const clients = await listEmbedClients(db);
    expect(clients.map((c) => c.name)).toEqual(["Second", "First"]);
  });

  it("listActiveEmbedClients excludes revoked clients", async () => {
    const { db } = await makeTestDb();
    const active = await createEmbedClient(db, { name: "Active", allowedOrigins: [] }, "ip");
    const toRevoke = await createEmbedClient(db, { name: "To Revoke", allowedOrigins: [] }, "ip");
    await revokeEmbedClient(db, toRevoke.id, "ip");

    const activeClients = await listActiveEmbedClients(db);
    expect(activeClients.map((c) => c.name)).toEqual(["Active"]);
  });

  it("gets a client by ID", async () => {
    const { db } = await makeTestDb();
    const client = await createEmbedClient(db, { name: "Lookup", allowedOrigins: [] }, "ip");
    const found = await getEmbedClient(db, client.id);
    expect(found?.name).toBe("Lookup");
    const notFound = await getEmbedClient(db, crypto.randomUUID());
    expect(notFound).toBeUndefined();
  });

  it("updates a client partially and writes an audit row", async () => {
    const { db } = await makeTestDb();
    const client = await createEmbedClient(
      db,
      { name: "Original", allowedOrigins: ["https://old.com"], rateLimitPerMin: 30 },
      "ip",
    );
    const updated = await updateEmbedClient(
      db,
      client.id,
      { name: "Updated", rateLimitPerMin: 90 },
      "ip",
    );
    expect(updated.name).toBe("Updated");
    expect(updated.allowedOrigins).toEqual(["https://old.com"]); // unchanged
    expect(updated.rateLimitPerMin).toBe(90);

    const audit = await recentAudit(db, 10);
    expect(audit[0].action).toBe("embed_client.update");
  });

  it("revokes a client (soft-delete) and writes an audit row", async () => {
    const { db } = await makeTestDb();
    const client = await createEmbedClient(db, { name: "To Delete", allowedOrigins: [] }, "ip");
    expect(client.revokedAt).toBeNull();

    await revokeEmbedClient(db, client.id, "ip");

    const revoked = await getEmbedClient(db, client.id);
    expect(revoked?.revokedAt).not.toBeNull();

    const audit = await recentAudit(db, 10);
    expect(audit[0].action).toBe("embed_client.revoke");
  });
});
