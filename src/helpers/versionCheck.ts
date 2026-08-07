import { useStore } from "@/store/store";
import { MessageDefinitions } from "@/types/types";

// How often a long-lived tab re-checks whether the deployed build has moved on since it loaded.
// Not urgent -- the reload prompt is a courtesy, not a correctness requirement -- so this errs
// on the infrequent side rather than adding needless background traffic:
const VERSION_CHECK_INTERVAL_MS = 10 * 60 * 1000;

let newVersionAlreadyShown = false;

async function checkForNewVersion(): Promise<void> {
    // Once shown, don't check again -- showMessage() would just be reasserting the same banner
    // (or clobbering whatever the user's looking at now if they dismissed it), and the user's
    // already been told what they need to know:
    if (newVersionAlreadyShown) {
        return;
    }
    try {
        // cache: "no-store" is essential here, not just a nice-to-have: the whole point is asking
        // the server what's current, so an HTTP-cached (even briefly cached) answer would defeat it.
        const response = await fetch(`${import.meta.env.BASE_URL}version.json`, {cache: "no-store"});
        if (!response.ok) {
            return;
        }
        const data = await response.json() as {gitHash?: string};
        if (data.gitHash && data.gitHash !== __BUILD_GIT_HASH__) {
            newVersionAlreadyShown = true;
            useStore().showMessage(MessageDefinitions.NewVersionAvailable, null);
        }
    }
    catch {
        // Network blip, offline, dev server with no version.json (only written by a real build --
        // see writeVersionFilePlugin in vite.config.mjs), etc. -- none of that is evidence of a new
        // version, so just try again next interval:
    }
}

export function startVersionCheck(): void {
    setInterval(() => void checkForNewVersion(), VERSION_CHECK_INTERVAL_MS);
}
