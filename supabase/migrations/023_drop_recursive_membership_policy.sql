-- Migration 023: Fix infinite-recursion RLS policy on facility_memberships.
--
-- 018 created a second SELECT policy on facility_memberships whose USING
-- clause queried facility_memberships itself ("Staff can view memberships in
-- own facility"). Postgres evaluates a table's policies while evaluating that
-- policy, producing:
--   ERROR 42P17: infinite recursion detected in policy for relation
--                "facility_memberships"
-- on EVERY query to the table (and to any table whose policies subquery it).
--
-- The policy was redundant: members can already see their own membership rows
-- via "Members can view own memberships" (auth.uid() = user_id), and no
-- client code reads other members' rows directly — staff scoping happens in
-- API routes through the server-side admin client. Forward-only: drop the
-- harmful policy; never re-create it.

DROP POLICY IF EXISTS "Staff can view memberships in own facility"
  ON facility_memberships;
