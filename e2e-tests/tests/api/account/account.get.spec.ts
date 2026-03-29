import { test, expect } from "../../../src/fixtures";
import { authedApiForUid } from "../../../src/api/services/client";

test("returns the current user", async ({ request, runtime }) => {
  const uid = process.env.TEST_USER_UID!;

  const client = await authedApiForUid(request, runtime.apiBaseUrl, uid);

  const signup = await client.post("/api/auth/signup", {
    firstName: "Test",
    lastName: "User",
    username: `acct_${Date.now()}`,
    location: "London",
  });

  expect(signup.status()).toBe(200);

  const res = await client.get("/api/account");
  expect(res.status()).toBe(200);

  const body: any = await res.json();
  const user = body?.user;

  expect(user).toBeTruthy();
  expect(user.uid).toBe(uid);
});
