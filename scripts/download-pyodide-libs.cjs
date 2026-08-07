// Downloads the Pyodide libraries (including numpy, pandas, etc) from Github
// and unpacks it to public/pyodide/<version>.  Only needs to be run:
// - After initial checkout of project from Git
// - When the Pyodide version is updated (change version in package.json, run npm install, then run this script).
//
// The version segment in the destination path is deliberate, not incidental: it's what lets the
// deployed server mark this whole directory as cacheable forever (see indexURL in
// python-execution.ts, and the server config documented in APACHE_CONFIG.md) -- a stable,
// unversioned path would mean either never caching it (slow) or risking a browser never picking
// up a future Pyodide upgrade because the URL never changed.

const fs = require("fs");
const path = require("path");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const tar = require("tar");
const bz2 = require("unbzip2-stream");

const DEST_ROOT = path.resolve(__dirname, "../public/pyodide");

// --- Get pyodide version from package-lock.json ---
function getPyodideVersion() {
    const lockPath = path.resolve(__dirname, "../package-lock.json");

    if (!fs.existsSync(lockPath)) {
        throw new Error("package-lock.json not found");
    }

    const lock = JSON.parse(fs.readFileSync(lockPath, "utf-8"));

    // npm v7+ structure
    if (lock.packages && lock.packages["node_modules/pyodide"]) {
        return lock.packages["node_modules/pyodide"].version;
    }

    // fallback (older npm)
    if (lock.dependencies && lock.dependencies.pyodide) {
        return lock.dependencies.pyodide.version;
    }

    throw new Error("Could not find pyodide version in package-lock.json");
}

// --- Download file ---
async function download(url, dest) {
    console.log(`Downloading ${url} (300+MB; this can take a few minutes)`);

    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`Download failed: ${res.status} ${res.statusText}`);
    }

    const nodeStream = Readable.fromWeb(res.body);

    await pipeline(nodeStream, fs.createWriteStream(dest));
}

// --- Main ---
async function main() {
    const version = getPyodideVersion();
    console.log(`Using pyodide version: ${version}`);

    const url = `https://github.com/pyodide/pyodide/releases/download/${version}/pyodide-${version}.tar.bz2`;

    const tmpFile = path.resolve(__dirname, `../pyodide-${version}.tar.bz2`);
    const destDir = path.join(DEST_ROOT, version);

    // Clean the whole DEST_ROOT (not just this version's folder), so a version bump doesn't leave
    // the previous version's files sitting around alongside the new ones -- there's never a reason
    // to keep both, since nothing on the deployed site references the old version's URL any more:
    fs.rmSync(DEST_ROOT, { recursive: true, force: true });
    fs.mkdirSync(destDir, { recursive: true });

    // download
    await download(url, tmpFile);

    console.log("Extracting (can take a minute)...");

    await new Promise((resolve, reject) => {
        fs.createReadStream(tmpFile)
            .pipe(bz2())
            .pipe(
                tar.x({
                    cwd: destDir,
                    strip: 1, // removes top-level folder
                })
            )
            .on("finish", resolve)
            .on("error", reject);
    });

    fs.unlinkSync(tmpFile);

    console.log(`Pyodide ready in public/pyodide/${version}`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
