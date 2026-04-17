// web/utils/analytics.ts
// Centralised PostHog event tracking. Safe to call even if PostHog isn't loaded yet.

import posthog from "posthog-js";

function isLoaded(): boolean {
  try {
    return !!(posthog as any).__loaded;
  } catch {
    return false;
  }
}

function track(event: string, properties?: Record<string, any>) {
  if (isLoaded()) {
    posthog.capture(event, properties);
  }
}

// ---- Auth events ----

export function trackSignup(method: "email" | "google", role: "homeowner" | "tradesman") {
  track("user_signed_up", { method, role });
}

export function trackLogin(method: "email" | "google") {
  track("user_logged_in", { method });
}

// ---- Project events ----

export function trackProjectCreated(projectId: number, type: string) {
  track("project_created", { project_id: projectId, type });
}

export function trackProjectPublished(projectId: number) {
  track("project_published", { project_id: projectId });
}

export function trackProjectClosed(projectId: number) {
  track("project_closed", { project_id: projectId });
}

// ---- Recommendation events ----

export function trackRecommendationMade(projectId: number, company: string) {
  track("recommendation_made", { project_id: projectId, company });
}

// ---- Hire events ----

export function trackHireSent(projectId: number, tradesmanId: string) {
  track("hire_sent", { project_id: projectId, tradesman_id: tradesmanId });
}

export function trackHireAccepted(hireId: number) {
  track("hire_accepted", { hire_id: hireId });
}

export function trackHireDeclined(hireId: number) {
  track("hire_declined", { hire_id: hireId });
}

// ---- Builder events ----

export function trackBuilderProfileViewed(builderId: string) {
  track("builder_profile_viewed", { builder_id: builderId });
}

export function trackBuilderFavourited(builderId: string) {
  track("builder_favourited", { builder_id: builderId });
}

export function trackBuilderVoted(recommendationId: number) {
  track("builder_voted", { recommendation_id: recommendationId });
}

// ---- Search / filter ----

export function trackSearch(query: string, context: string) {
  track("search_performed", { query, context });
}

export function trackFilterApplied(filters: Record<string, any>, context: string) {
  track("filter_applied", { ...filters, context });
}

// ---- Notification events ----

export function trackPushEnabled() {
  track("push_notifications_enabled");
}

export function trackPushSkipped() {
  track("push_notifications_skipped");
}

// ---- Home screen ----

export function trackAddToHomeScreenShown() {
  track("add_to_homescreen_shown");
}

export function trackAddToHomeScreenDismissed() {
  track("add_to_homescreen_dismissed");
}

export function trackAddToHomeScreenInstalled() {
  track("add_to_homescreen_installed");
}

// ---- Report ----

export function trackReportSubmitted(targetType: string, category: string) {
  track("report_submitted", { target_type: targetType, category });
}

// ---- Generic ----

export function trackEvent(event: string, properties?: Record<string, any>) {
  track(event, properties);
}
