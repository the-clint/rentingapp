import { deleteTestUsers } from "./helpers/test-user";

export default async function globalTeardown(): Promise<void> {
  try {
    const count = await deleteTestUsers();
    console.log(`[e2e teardown] Deleted ${count} test user(s).`);
  } catch (error) {
    console.error("[e2e teardown] Cleanup failed:", error);
    throw error;
  }
}
