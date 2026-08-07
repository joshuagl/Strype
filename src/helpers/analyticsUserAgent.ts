export interface UserAgentInfo {
    os: string;
    browserName: string;
    browserVersion: string | null;
}

// OS version is deliberately not attempted: it's unreliable across the browsers/OSes Strype
// actually sees in schools. Windows 10 and 11 report the identical "Windows NT 10.0" (Microsoft
// never bumped it), and Chrome freezes the reported macOS version in its UA string for privacy --
// so any OS version we recorded would be wrong often enough to be misleading. The OS *name* and
// the browser's major version are both reliable, so that's what we record.
function detectOs(ua: string): string {
    // Order matters: Android's UA also contains "Linux", and iOS's contains "like Mac OS X":
    if (/Windows/.test(ua)) {
        return "Windows";
    }
    if (/Android/.test(ua)) {
        return "Android";
    }
    if (/iPhone|iPad|iPod/.test(ua)) {
        return "iOS";
    }
    if (/CrOS/.test(ua)) {
        return "ChromeOS";
    }
    if (/Mac OS X/.test(ua)) {
        return "macOS";
    }
    if (/Linux/.test(ua)) {
        return "Linux";
    }
    return "Other";
}

function detectBrowserNameAndVersion(ua: string): {name: string, version: string | null} {
    // Order matters: Edge and Opera are Chromium-based, so their UA strings also carry a
    // "Chrome/x" token, and Chrome's UA string also carries a "Safari/x" token -- so the more
    // specific brand checks have to come first, or they'd all get misidentified as Chrome/Safari.
    // Safari's real version comes from a separate "Version/x" token, not "Safari/x" (that's the
    // WebKit build number, not the browser version).
    const edge = ua.match(/\bEdg\/(\d+)/);
    if (edge) {
        return {name: "Edge", version: edge[1]};
    }
    const opera = ua.match(/\bOPR\/(\d+)/);
    if (opera) {
        return {name: "Opera", version: opera[1]};
    }
    const firefox = ua.match(/\bFirefox\/(\d+)/);
    if (firefox) {
        return {name: "Firefox", version: firefox[1]};
    }
    const chrome = ua.match(/\bChrome\/(\d+)/);
    if (chrome) {
        return {name: "Chrome", version: chrome[1]};
    }
    if (/\bSafari\//.test(ua)) {
        const version = ua.match(/\bVersion\/(\d+)/);
        return {name: "Safari", version: version ? version[1] : null};
    }
    return {name: "Other", version: null};
}

export function detectOsAndBrowser(): UserAgentInfo {
    const ua = navigator.userAgent;
    const {name, version} = detectBrowserNameAndVersion(ua);
    return {os: detectOs(ua), browserName: name, browserVersion: version};
}
