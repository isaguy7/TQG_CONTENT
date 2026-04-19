// Barrel for src/lib/org.
//
// NOTE: `./server` re-exports helpers that call `cookies()` via the
// session-scoped Supabase client. Importing the barrel from a Client
// Component is type-safe but calling getActiveOrgId() / requireRole()
// from the browser will throw at runtime. Prefer `@/lib/org/server` for
// explicit server-only imports.
export * from "./types";
export * from "./active-org";
export * from "./server";
export * from "./policy-template";
