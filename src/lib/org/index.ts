// Barrel for src/lib/org.
//
// NOTE: ./server re-exports helpers that call cookies() via the
// session-scoped Supabase client. Importing the barrel from a Client
// Component is type-safe but calling getActiveOrgId() / requireRole()
// from the browser will throw at runtime. Prefer `@/lib/org/server` for
// explicit server-only imports when the call site is known to be server.
export * from "./types";
export * from "./server";
export {
  useActiveOrg,
  getActiveOrgIdFromStorage,
  ACTIVE_ORG_STORAGE_KEY,
  type UseActiveOrgResult,
} from "./active-org";
export { ORG_SCOPED_POLICY_TEMPLATE } from "./policy-template";
