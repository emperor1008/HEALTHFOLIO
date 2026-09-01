-- Migration 013: Medication Routine Agent
-- Creates medication_plans, schedule_rules, occurrences, adherence_events, plan_revisions,
-- notification_subscriptions, notification_deliveries

-- ============================================================
-- MEDICATION PLANS
-- ============================================================
CREATE TABLE IF NOT EXISTS medication_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  medicine_entity_id UUID REFERENCES medicine_entities(id) ON DELETE SET NULL,
  prescription_item_id UUID NOT NULL REFERENCES prescription_items(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  source_instruction TEXT NOT NULL,
  plan_type TEXT NOT NULL DEFAULT 'unclear'
    CHECK (plan_type IN ('fixed_times', 'times_per_day', 'interval', 'specific_weekdays',
      'date_range', 'course_duration', 'tapering', 'as_needed', 'one_time', 'unclear')),
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'review_required', 'active', 'paused', 'completed',
      'expired', 'superseded', 'invalidated', 'rejected')),
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  start_date DATE,
  end_date DATE,
  confidence NUMERIC(3,2) CHECK (confidence >= 0 AND confidence <= 1),
  requires_review BOOLEAN NOT NULL DEFAULT true,
  activated_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE medication_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own medication plans"
  ON medication_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own medication plans"
  ON medication_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own medication plans"
  ON medication_plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own medication plans"
  ON medication_plans FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_med_plans_user ON medication_plans(user_id);
CREATE INDEX idx_med_plans_status ON medication_plans(status);
CREATE INDEX idx_med_plans_prescription ON medication_plans(prescription_item_id);
CREATE INDEX idx_med_plans_document ON medication_plans(document_id);
CREATE INDEX idx_med_plans_plan_type ON medication_plans(plan_type);
CREATE UNIQUE INDEX idx_med_plans_active_per_prescription ON medication_plans(prescription_item_id)
  WHERE status IN ('active', 'paused', 'review_required');

CREATE TRIGGER set_med_plans_updated_at
  BEFORE UPDATE ON medication_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MEDICATION SCHEDULE RULES
-- ============================================================
CREATE TABLE IF NOT EXISTS medication_schedule_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_plan_id UUID NOT NULL REFERENCES medication_plans(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL DEFAULT 'fixed_times'
    CHECK (rule_type IN ('fixed_times', 'interval', 'specific_weekdays', 'as_needed')),
  local_time TIME,
  interval_hours INTEGER,
  weekdays INTEGER[],
  start_date DATE,
  end_date DATE,
  timing_relation TEXT,
  source_type TEXT NOT NULL DEFAULT 'system_suggested'
    CHECK (source_type IN ('prescription', 'user_selected', 'system_suggested')),
  source_text TEXT,
  user_confirmed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE medication_schedule_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own schedule rules"
  ON medication_schedule_rules FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own schedule rules"
  ON medication_schedule_rules FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own schedule rules"
  ON medication_schedule_rules FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own schedule rules"
  ON medication_schedule_rules FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_schedule_rules_user ON medication_schedule_rules(user_id);
CREATE INDEX idx_schedule_rules_plan ON medication_schedule_rules(medication_plan_id);
CREATE TRIGGER set_schedule_rules_updated_at
  BEFORE UPDATE ON medication_schedule_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MEDICATION OCCURRENCES
-- ============================================================
CREATE TABLE IF NOT EXISTS medication_occurrences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_plan_id UUID NOT NULL REFERENCES medication_plans(id) ON DELETE CASCADE,
  schedule_rule_id UUID NOT NULL REFERENCES medication_schedule_rules(id) ON DELETE CASCADE,
  scheduled_for TIMESTAMPTZ NOT NULL,
  local_scheduled_time TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'due', 'taken', 'skipped', 'snoozed', 'missed', 'cancelled', 'invalidated')),
  due_window_start TIMESTAMPTZ NOT NULL,
  due_window_end TIMESTAMPTZ NOT NULL,
  notification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (notification_status IN ('pending', 'sent', 'failed', 'expired', 'cancelled')),
  generated_from_revision INTEGER NOT NULL DEFAULT 1,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_occurrence_idempotency UNIQUE (user_id, idempotency_key)
);

ALTER TABLE medication_occurrences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own occurrences"
  ON medication_occurrences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own occurrences"
  ON medication_occurrences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own occurrences"
  ON medication_occurrences FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_occurrences_user ON medication_occurrences(user_id);
CREATE INDEX idx_occurrences_plan ON medication_occurrences(medication_plan_id);
CREATE INDEX idx_occurrences_scheduled ON medication_occurrences(scheduled_for);
CREATE INDEX idx_occurrences_status ON medication_occurrences(status);
CREATE INDEX idx_occurrences_due_window ON medication_occurrences(due_window_start, due_window_end)
  WHERE status IN ('scheduled', 'due', 'snoozed');
CREATE TRIGGER set_occurrences_updated_at
  BEFORE UPDATE ON medication_occurrences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- MEDICATION ADHERENCE EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS medication_adherence_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_plan_id UUID NOT NULL REFERENCES medication_plans(id) ON DELETE CASCADE,
  occurrence_id UUID REFERENCES medication_occurrences(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL
    CHECK (event_type IN ('marked_taken', 'marked_skipped', 'snoozed', 'marked_not_now', 'corrected', 'reverted')),
  event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_timezone TEXT,
  optional_reason TEXT,
  client_request_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE medication_adherence_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own adherence events"
  ON medication_adherence_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own adherence events"
  ON medication_adherence_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_adherence_user ON medication_adherence_events(user_id);
CREATE INDEX idx_adherence_plan ON medication_adherence_events(medication_plan_id);
CREATE INDEX idx_adherence_occurrence ON medication_adherence_events(occurrence_id);
CREATE INDEX idx_adherence_client_request ON medication_adherence_events(client_request_id);

-- ============================================================
-- MEDICATION PLAN REVISIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS medication_plan_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  medication_plan_id UUID NOT NULL REFERENCES medication_plans(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL DEFAULT 1,
  previous_plan JSONB,
  revised_plan JSONB NOT NULL,
  revision_reason TEXT NOT NULL,
  actor_type TEXT NOT NULL DEFAULT 'user',
  source_document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE medication_plan_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own plan revisions"
  ON medication_plan_revisions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own plan revisions"
  ON medication_plan_revisions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_plan_revisions_user ON medication_plan_revisions(user_id);
CREATE INDEX idx_plan_revisions_plan ON medication_plan_revisions(medication_plan_id);

-- ============================================================
-- NOTIFICATION SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint_hash TEXT NOT NULL,
  endpoint_encrypted TEXT NOT NULL,
  p256dh_encrypted TEXT NOT NULL,
  auth_encrypted TEXT NOT NULL,
  user_agent_family TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0,
  invalidated_at TIMESTAMPTZ
);

ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own push subscriptions"
  ON notification_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own push subscriptions"
  ON notification_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push subscriptions"
  ON notification_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_push_subs_user ON notification_subscriptions(user_id);
CREATE INDEX idx_push_subs_enabled ON notification_subscriptions(enabled)
  WHERE enabled = true AND invalidated_at IS NULL;

-- ============================================================
-- NOTIFICATION DELIVERIES
-- ============================================================
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  occurrence_id UUID NOT NULL REFERENCES medication_occurrences(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES notification_subscriptions(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'in_app'
    CHECK (channel IN ('in_app', 'push', 'browser')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  attempted_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'expired', 'cancelled', 'subscription_invalid')),
  provider_message_id TEXT,
  failure_code TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_delivery_idempotency UNIQUE (user_id, idempotency_key)
);

ALTER TABLE notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notification deliveries"
  ON notification_deliveries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert notification deliveries"
  ON notification_deliveries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "System can update notification deliveries"
  ON notification_deliveries FOR UPDATE
  USING (auth.uid() = user_id);

CREATE INDEX idx_deliveries_user ON notification_deliveries(user_id);
CREATE INDEX idx_deliveries_occurrence ON notification_deliveries(occurrence_id);
CREATE INDEX idx_deliveries_status ON notification_deliveries(status)
  WHERE status IN ('pending', 'sent');
CREATE INDEX idx_deliveries_scheduled ON notification_deliveries(scheduled_for)
  WHERE status = 'pending';
