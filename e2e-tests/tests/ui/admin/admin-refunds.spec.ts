import { test, expect } from "../../../src/ui.fixtures";
import { seedUsers } from "../../../src/db/manage-db";
import { AuthApi } from "../../../src/apiHelper/auth/AuthApi";

const ADMIN_UID = process.env.TEST_ADMIN_USER_UID!;
const ADMIN_EMAIL = process.env.E2E_ADMIN_USER_EMAIL!;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_USER_PASSWORD!;

// The admin refund tool issues Stripe refunds by id. In E2E we use the
// mock payments driver which accepts any synthetic pi_*/ch_* and
// returns a fake re_mock_*. The driver also recognises pi_force_error
// as a failure injection point - see server/lib/payments/mock.js.
test.describe("Admin refund tool (/admin/refunds)", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ runtime, request, basePage, authHelper }) => {
    await seedUsers(runtime.dbName);
    await AuthApi.ensureEmulatorUser(
      request,
      runtime.apiBaseUrl,
      ADMIN_UID,
      ADMIN_EMAIL,
      ADMIN_PASSWORD,
    );
    await basePage.logoutViaUrl();
    await authHelper.loginAsUid(ADMIN_UID);
  });

  test("admin can refund a payment by intent id and see it in the audit list", async ({
    adminRefundsPage,
  }) => {
    const pi = `pi_e2e_${Date.now()}`;
    const reason = "charged in error - e2e";

    await adminRefundsPage.goto();
    await adminRefundsPage.refundByPaymentIntent(pi, reason);
    await adminRefundsPage.expectFlashContains(/refunded/i);
    await adminRefundsPage.expectRowFor(pi);
    await adminRefundsPage.expectRowWithReason(reason);
  });

  test("a Stripe failure surfaces in the flash and lands as an error row in the audit list", async ({
    adminRefundsPage,
  }) => {
    const reason = "intentional failure path - e2e";

    await adminRefundsPage.goto();
    await adminRefundsPage.refundByPaymentIntent("pi_force_error", reason);
    await adminRefundsPage.expectFlashContains(/refund failed/i);
    await adminRefundsPage.expectRowFor("pi_force_error");
    await adminRefundsPage.expectRowWithReason(reason);
    await expect(adminRefundsPage.rows).toContainText(/error/i);
  });
});
