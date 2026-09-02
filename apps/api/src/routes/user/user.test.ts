import {
    applyD1Migrations,
    env,
  } from "cloudflare:test";
  import { testClient } from "hono/testing";
  import { beforeAll, describe, expect, it } from "vitest";
  
  import { createDb } from "@/api/db";
  import { users } from "@/api/db/schema/user";
  import type { AppEnv } from "@/api/lib/types";
  import createApp from "@/api/lib/create-app";
  
  import router from "./user.index";
  
  const client = testClient(createApp().route("/users", router), env);
  const typedEnv = env as unknown as AppEnv["Bindings"];
  const testEnv = env as unknown as AppEnv["Bindings"] & { TEST_MIGRATIONS: Parameters<typeof applyD1Migrations>[1] };
  
  describe("users routes", () => {
    beforeAll(async () => {
      await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
    });
  
    it("get /users returns 404 when no users found", async () => {
      const response = await client.api.users.$get();
  
      expect(response.status).toBe(404);
      if (response.status === 404) {
        const json = await response.json();
        expect(json.message).toBe("Users not found");
      }
    });
  
    it("get /users lists all users", async () => {
      // Insert a test user using Drizzle ORM
      const db = createDb(typedEnv);
      const testUser = {
        id: crypto.randomUUID(),
        username: "testuser",
        email: "test@example.com",
        passwordHash: "hashedpassword",
      };
  
      await db.insert(users).values(testUser);
  
      const response = await client.api.users.$get();
  
      expect(response.status).toBe(200);
      if (response.status === 200) {
        const json = await response.json();
        expect(Array.isArray(json)).toBe(true);
        expect(json.length).toBeGreaterThan(0);
        expect(json[0]).toHaveProperty("id");
        expect(json[0]).toHaveProperty("username");
        expect(json[0]).toHaveProperty("email");
        expect(json[0]).not.toHaveProperty("passwordHash");
        expect(json[0]).not.toHaveProperty("createdAt");
        expect(json[0]).not.toHaveProperty("updatedAt");
        expect(json[0].username).toBe(testUser.username);
        expect(json[0].email).toBe(testUser.email);
      }
    });
  });
  