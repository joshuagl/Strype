import { settingsStore } from "@/store/store";
import { onAnalyticsPageUnload, startSessionTracking } from "@/helpers/sessionTracker";
import { Analytics_batch_flush_ms } from "@/helpers/analyticsConstants";
import {
    analyticsState,
    enqueueAnalyticsEvent,
    flushAnalyticsQueue,
    initAnalyticsCountry,
    initAnalyticsPlatform,
    initAnalyticsSession,
    initAnalyticsUserAgent,
    initAnalyticsUserId,
    trackAnalyticsLocaleChange,
} from "@/store/analytics";

export function initialiseAnalytics(): void {
    initAnalyticsUserId();
    initAnalyticsSession();
    initAnalyticsPlatform();
    initAnalyticsUserAgent();
    startSessionTracking();
    void initAnalyticsCountry();

    settingsStore().$subscribe((_mutation, state) => {
        if (typeof state.locale === "string" && state.locale.length > 0) {
            trackAnalyticsLocaleChange(state.locale);
        }
    });

    enqueueAnalyticsEvent("session_start", {locale: analyticsState.locale});

    setInterval(() => flushAnalyticsQueue("interval"), Analytics_batch_flush_ms);

    window.addEventListener("beforeunload", onAnalyticsPageUnload);
    window.addEventListener("pagehide", onAnalyticsPageUnload);
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
            onAnalyticsPageUnload();
        }
    });
}
