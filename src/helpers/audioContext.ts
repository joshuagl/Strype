// We are not meant to create multiple audio contexts so we have one singleton context stored here.
// As noted below, it can only be created in response to a user gesture, hence why we must start
// with it being null and only create on a call to createOrGetAudioContext() below.
let audioContext : AudioContext | null = null;

// Some browsers (particularly Safari/WebKit, on both iOS and macOS) can leave an AudioContext
// in a state where it reports state "running" but has actually stopped processing audio --
// most commonly after the tab/app has been backgrounded (or the device locked) for a while.
// We track the last time we observed audioContext.currentTime advancing, so that we can spot
// a context that looks alive (state == "running") but is not actually making progress, and
// recreate it in that case.
let lastObservedCurrentTime = 0;
let lastObservedAt = 0;

// If a "running" context hasn't advanced its clock for longer than this, in wall-clock terms,
// we treat it as dead and replace it. Kept generous to avoid false positives from normal
// scheduling jitter.
const STUCK_THRESHOLD_MS = 2000;

function isStuck(ctx: AudioContext) : boolean {
    if (ctx.state !== "running") {
        return false;
    }
    const now = Date.now();
    const stuck = lastObservedAt !== 0
        && (now - lastObservedAt) > STUCK_THRESHOLD_MS
        && ctx.currentTime <= lastObservedCurrentTime;
    if (stuck) {
        // Log this so that if a user reports sound silently stopping, we have a chance of
        // spotting it in the console: it's exactly the "running but not producing audio" state
        // this function exists to detect.
        console.warn(`AudioContext detected as stuck (state "${ctx.state}", currentTime stayed at ${ctx.currentTime} for ${now - lastObservedAt}ms) -- recreating it.`);
    }
    // Refresh our observation regardless, ready for the next check:
    lastObservedCurrentTime = ctx.currentTime;
    lastObservedAt = now;
    return stuck;
}

// Note: you must only call this function in response to a user gesture (e.g. a mouse click)
// because only such code is allowed to create the AudioContext, which we need to do if this
// is the first time this function has been called (or if we need to recover a dead context,
// see below).
export function createOrGetAudioContext() : AudioContext {
    if (audioContext == null || audioContext.state === "closed" || isStuck(audioContext)) {
        if (audioContext != null && audioContext.state !== "closed") {
            // Don't wait for this; we just want to release its resources:
            audioContext.close().catch((err) => console.warn("Error closing previous AudioContext (ignoring, continuing with a new one):", err));
        }
        audioContext = new AudioContext();
        // Seed the baseline immediately rather than leaving it at the "unobserved" 0/0
        // sentinel: isStuck() is never called on this same creation path (short-circuited
        // by audioContext == null above), so without this the *next* call to isStuck() would
        // see lastObservedAt === 0 and skip the stuck check entirely, just re-seeding the
        // baseline instead of actually comparing against it -- meaning a context that died
        // immediately after creation wouldn't be caught until a third call, one cycle later
        // than intended:
        lastObservedCurrentTime = audioContext.currentTime;
        lastObservedAt = Date.now();
    }
    else if (audioContext.state === "suspended" || audioContext.state === "interrupted") {
        // "suspended" can happen if the browser suspended us (e.g. backgrounding). "interrupted"
        // is Safari-specific: unlike "suspended" (which we/the page asked for), it means the
        // *browser* paused us for something outside the page's control -- an incoming call, Siri,
        // an alarm, another app taking audio focus, etc -- and per Apple's guidance the fix is the
        // same: just call resume() once the interruption is over. Without this, a context left
        // "interrupted" would never be recovered at all: it's not "running" (so isStuck() above
        // ignores it) and not "closed" (so the recreate branch ignores it too), so it would
        // otherwise just sit there silently and never produce sound again. Resuming does not
        // require a fresh user gesture in any of our supported browsers, so we can just try it
        // directly here.
        audioContext.resume().catch((err) => console.warn(`Error resuming ${audioContext?.state} AudioContext (caller will still get the context and can retry later):`, err));
    }
    return audioContext;
}

// Closes the shared AudioContext, if one exists. Callers should invoke this once they know no
// more sound will be played until the next createOrGetAudioContext() call (e.g. execution
// finished, or a media dialog/popup closed) -- this bounds how long a context stays alive, which
// keeps us out of the long-lived-background-context territory where Safari has been observed to
// silently stop delivering audio.
export function closeAudioContext() : void {
    if (audioContext != null && audioContext.state !== "closed") {
        audioContext.close().catch((err) => console.warn("Error closing AudioContext (ignoring):", err));
    }
    audioContext = null;
    lastObservedCurrentTime = 0;
    lastObservedAt = 0;
}

// Proactively check/recover the audio context whenever the page becomes visible again, since
// that's the most common point at which a backgrounded AudioContext will have died. This is a
// no-op if no AudioContext has been created yet.
if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible" && audioContext != null) {
            createOrGetAudioContext();
        }
    });
}
