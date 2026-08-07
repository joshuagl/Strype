import { fetchUserCountry, type UserCountry } from "@/helpers/analyticsCountry";
import { detectOsAndBrowser } from "@/helpers/analyticsUserAgent";
import { Analytics_batch_max_events, Analytics_queue_overflow_cap } from "@/helpers/analyticsConstants";
import { StrypeSyncTarget } from "@/types/types";

export interface AnalyticsEvent {
    eventId: string;
    eventType: string;
    recordTime: string;
    payload: Record<string, unknown>;
}

export type AnalyticsFlushReason = "interval" | "size_cap" | "critical" | "unload";

/** Session-scoped analytics data (held outside Pinia — not persisted in project state). */
export const analyticsState = {
    countryCode: null as string | null,
    countryName: null as string | null,
    os: "" as string,
    browserName: "" as string,
    browserVersion: null as string | null,
    userId: "" as string,
    sessionStartTime: 0 as number,
    activeSessionTime: 0 as number,
    frameCount: 0 as number,
    sessionId: "" as string,
    platform: "editor" as "editor" | "microbit",
    locale: "" as string,
    eventQueue: [] as AnalyticsEvent[],
    pendingOutputChars: 0 as number,
    flushInProgress: false as boolean,
};

export function initAnalyticsUserId(): void {
    const storageKey = "StrypeAnalyticsUserId";
    let userId = localStorage.getItem(storageKey);
    if (!userId) {
        userId = crypto.randomUUID();
        localStorage.setItem(storageKey, userId);
    }
    analyticsState.userId = userId;
}

export function initAnalyticsSession(): void {
    analyticsState.sessionId = (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : `sess-${Date.now()}`;
}

export function initAnalyticsPlatform(): void {
    // #v-ifdef MODE == VITE_MICROBIT_MODE
    analyticsState.platform = "microbit";
    // #v-else
    const path = (typeof window !== "undefined") ? window.location.pathname.toLowerCase() : "";
    analyticsState.platform = path.includes("microbit") ? "microbit" : "editor";
    // #v-endif
}

export function initAnalyticsUserAgent(): void {
    const {os, browserName, browserVersion} = detectOsAndBrowser();
    analyticsState.os = os;
    analyticsState.browserName = browserName;
    analyticsState.browserVersion = browserVersion;
}

export function setAnalyticsCountry(country: UserCountry): void {
    analyticsState.countryCode = country.countryCode;
    analyticsState.countryName = country.countryName;
}

export async function initAnalyticsCountry(): Promise<void> {
    const country = await fetchUserCountry();
    setAnalyticsCountry(country);
}

export function enqueueAnalyticsEvent(eventType: string, payload: Record<string, unknown> = {}): void {
    analyticsState.eventQueue.push({
        eventId: crypto.randomUUID(),
        eventType,
        recordTime: new Date().toISOString(),
        payload,
    });
    if (analyticsState.eventQueue.length >= Analytics_batch_max_events) {
        flushAnalyticsQueue("size_cap");
    }
}

export function flushAnalyticsQueue(reason: AnalyticsFlushReason): void {
    const ingestUrl = import.meta.env.VITE_ANALYTICS_INGEST_URL?.trim();
    if (!ingestUrl) {
        return;
    }
    if (analyticsState.flushInProgress && reason !== "unload") {
        return;
    }

    if (analyticsState.pendingOutputChars > 0) {
        analyticsState.eventQueue.push({
            eventId: crypto.randomUUID(),
            eventType: "output_chunk",
            recordTime: new Date().toISOString(),
            payload: {chars: analyticsState.pendingOutputChars},
        });
        analyticsState.pendingOutputChars = 0;
    }

    if (analyticsState.eventQueue.length === 0) {
        return;
    }

    const batch = analyticsState.eventQueue;
    analyticsState.eventQueue = [];

    const body = JSON.stringify({
        userId: analyticsState.userId,
        sessionId: analyticsState.sessionId,
        platform: analyticsState.platform,
        countryCode: analyticsState.countryCode,
        countryName: analyticsState.countryName,
        os: analyticsState.os,
        browserName: analyticsState.browserName,
        browserVersion: analyticsState.browserVersion,
        flushReason: reason,
        events: batch,
    });
    
    // Skip if not running on strype.org but the ingest server is there:
    if (ingestUrl.includes("strype.org") && !window.location.hostname.includes("strype.org")) {
        return;
    }

    if (reason === "unload" && typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(ingestUrl, new Blob([body], {type: "text/plain"}));
        return;
    }

    analyticsState.flushInProgress = true;
    void fetch(ingestUrl, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body,
        mode: "cors",
        keepalive: reason === "unload",
    }).then((res) => {
        if (!res.ok) {
            throw new Error(`ingest returned ${res.status}`);
        }
    }).catch(() => {
        analyticsState.eventQueue = [...batch, ...analyticsState.eventQueue];
        if (analyticsState.eventQueue.length > Analytics_queue_overflow_cap) {
            analyticsState.eventQueue = analyticsState.eventQueue.slice(-Analytics_queue_overflow_cap);
        }
    }).finally(() => {
        analyticsState.flushInProgress = false;
    });
}

export function trackMenuAction(actionId: string): void {
    enqueueAnalyticsEvent("menu_action", {actionId});
}

export function trackInputCall(): void {
    enqueueAnalyticsEvent("input_call");
}

export function trackOutputChars(charCount: number): void {
    analyticsState.pendingOutputChars += charCount;
}

export function initAnalyticsLocale(locale: string): void {
    analyticsState.locale = locale;
}

export function trackAnalyticsLocaleChange(newLocale: string): void {
    const previousLocale = analyticsState.locale;
    if (!previousLocale || previousLocale === newLocale) {
        analyticsState.locale = newLocale;
        return;
    }
    enqueueAnalyticsEvent("locale_change", {from: previousLocale, to: newLocale});
    analyticsState.locale = newLocale;
}

export function trackUsedDemo(demoName: string, source: string): void {
    const cleanDemoName = demoName.trim();
    if (cleanDemoName.length === 0) {
        return;
    }
    enqueueAnalyticsEvent("demo_used", {demoName: cleanDemoName, source});
}

export function trackUsedBookProject(projectName: string, chapter: string): void {
    const cleanName = projectName.trim();
    if (cleanName.length === 0) {
        return;
    }
    enqueueAnalyticsEvent("book_project_used", {projectName: cleanName, chapter});
}

export function trackStorageLocation(target: StrypeSyncTarget): void {
    let storageLocation: "local" | "cloud" | null = null;
    if (target == StrypeSyncTarget.fs) {
        storageLocation = "local";
    }
    else if (target == StrypeSyncTarget.gd || target == StrypeSyncTarget.od) {
        storageLocation = "cloud";
    }
    if (storageLocation == null) {
        return;
    }
    enqueueAnalyticsEvent("save", {storageLocation});
}
