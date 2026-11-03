import {expect, test} from "@playwright/test";
import {setupStrypeTest} from "../support/general";
import {enterCode, pressFrameShortcut, waitForEditorSettled} from "../support/editor";

test.beforeEach(async ({page, browserName}, testInfo) => {
    await page.addInitScript(() => {
        const originalCreateOscillator = AudioContext.prototype.createOscillator;
        Object.defineProperty(AudioContext.prototype, "createOscillator", {
            configurable: true,
            value: function(this: AudioContext) {
                const oscillator = originalCreateOscillator.call(this);
                const originalStart = oscillator.start.bind(oscillator);
                let frequency = oscillator.frequency.value;
                const originalSetFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
                Object.defineProperty(oscillator.frequency, "setValueAtTime", {
                    value: (value: number, when: number) => {
                        frequency = value;
                        return originalSetFrequency(value, when);
                    },
                });
                Object.defineProperty(oscillator, "start", {
                    value: (when?: number) => {
                        const win = window as unknown as {editorToneStarts?: {type: OscillatorType; frequency: number}[]};
                        win.editorToneStarts ??= [];
                        win.editorToneStarts.push({type: oscillator.type, frequency});
                        originalStart(when);
                    },
                });
                return oscillator;
            },
        });
    });
    await setupStrypeTest(page, browserName, testInfo, {timeoutMs: 60000, skipPyodide: true});
});

test("plays a distinct cue for indentation changes when enabled", async ({page}) => {
    await enterCode(page, ["", "", "if True:\n    if True:\n        print('inner')\n    print('outer')\n    print('same level')"]);
    const frameIds = await page.evaluate(() => {
        const app = (document.getElementById("app") as any).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const outerFrameId = store.frameObjects[-3].childrenIds[0];
        const [innerFrameId, siblingFrameId, sameLevelSiblingId] = store.frameObjects[outerFrameId].childrenIds;
        const leafFrameId = store.frameObjects[innerFrameId].childrenIds[0];
        return {outerFrameId, innerFrameId, leafFrameId, siblingFrameId, sameLevelSiblingId};
    });

    await page.evaluate(() => {
        (window as unknown as {editorToneStarts: unknown[]}).editorToneStarts = [];
        const app = (document.getElementById("app") as any).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("settings");
        store.setSectionChangeSoundEnabled(false);
    });
    await moveCaretToFrame(page, frameIds.outerFrameId);
    await moveCaretToFrame(page, frameIds.innerFrameId);
    expect(await getToneCount(page)).toBe(0);

    await page.evaluate(() => {
        const app = (document.getElementById("app") as any).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("settings");
        store.setSectionChangeSoundEnabled(true);
    });
    await moveCaretToFramePosition(page, frameIds.outerFrameId, "caretBody");
    await page.evaluate(() => {
        (window as unknown as {editorToneStarts: unknown[]}).editorToneStarts = [];
    });
    await moveCaretToFramePosition(page, frameIds.innerFrameId, "caretBody");
    expect(await getToneCount(page)).toBe(2);
    await moveCaretToFrame(page, frameIds.leafFrameId);
    await moveCaretToFrame(page, frameIds.siblingFrameId);
    await moveCaretToFrame(page, frameIds.sameLevelSiblingId);

    const tones = await page.evaluate(() => (window as unknown as {
        editorToneStarts: {type: OscillatorType; frequency: number}[];
    }).editorToneStarts);
    expect(tones).toHaveLength(4);
    expect(tones.map((tone) => tone.frequency)).toEqual([440, 440, 660, 660]);
    expect(tones.every((tone) => tone.type === "triangle")).toBe(true);
});

test("plays a cue when inserting a scope-changing frame", async ({page}) => {
    await page.evaluate(() => {
        (window as unknown as {editorToneStarts: unknown[]}).editorToneStarts = [];
        const app = (document.getElementById("app") as any).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        store.setCurrentFrame({id: -3, caretPosition: "caretBody"});
    });

    await pressFrameShortcut(page, "f");
    await waitForEditorSettled(page);
    expect(await getToneCount(page)).toBe(0);

    const forFrameId = await page.evaluate(async () => {
        const app = (document.getElementById("app") as any).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const frameId = store.frameObjects[-3].childrenIds.find((id: number) => store.frameObjects[id].frameType.type === "for");
        store.isEditing = false;
        store.setCurrentFrame({id: frameId, caretPosition: "caretBody"});
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        return frameId as number;
    });
    expect(forFrameId).toBeGreaterThan(0);

    const tones = await page.evaluate(() => (window as unknown as {
        editorToneStarts: {type: OscillatorType; frequency: number}[];
    }).editorToneStarts);
    expect(tones.map((tone) => tone.frequency)).toEqual([440]);
});

test("plays a warning tone when the next frame has a runtime warning", async ({page}) => {
    await enterCode(page, ["", "", "print('warning')"]);
    await page.evaluate(async () => {
        const app = (document.getElementById("app") as any).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const nextFrameId = store.frameObjects[-3].childrenIds[0];
        store.frameObjects[nextFrameId].runTimeError = "Example runtime issue";
        store.setCurrentFrame({id: -3, caretPosition: "caretBelow"});
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        (window as unknown as {editorToneStarts: unknown[]}).editorToneStarts = [];
        store.setCurrentFrame({id: -3, caretPosition: "caretBody"});
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
    });

    const tones = await page.evaluate(() => (window as unknown as {
        editorToneStarts: {type: OscillatorType; frequency: number}[];
    }).editorToneStarts);
    expect(tones.map((tone) => tone.frequency)).toEqual([880, 660]);
    expect(tones.every((tone) => tone.type === "sine")).toBe(true);
});

test("does not play a dedent cue when entering an else body", async ({page}) => {
    await enterCode(page, ["", "", "if True:\n    print('if')\nelse:\n    print('else')"]);
    const frameIds = await page.evaluate(() => {
        const app = (document.getElementById("app") as any).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const ifFrameId = store.frameObjects[-3].childrenIds[0];
        const ifChildId = store.frameObjects[ifFrameId].childrenIds[0];
        const elseFrameId = store.frameObjects[ifFrameId].jointFrameIds[0];
        return {ifChildId, elseFrameId};
    });

    await moveCaretToFramePosition(page, frameIds.ifChildId, "caretBelow");
    await page.evaluate(() => {
        (window as unknown as {editorToneStarts: unknown[]}).editorToneStarts = [];
    });
    await moveCaretToFramePosition(page, frameIds.elseFrameId, "caretBody");

    expect(await getToneCount(page)).toBe(0);
});

async function moveCaretToFrame(page: import("@playwright/test").Page, frameId: number): Promise<void> {
    await moveCaretToFramePosition(page, frameId, "caretBelow");
}

async function moveCaretToFramePosition(page: import("@playwright/test").Page, frameId: number, caretPosition: "caretBody" | "caretBelow"): Promise<void> {
    await page.evaluate(async (id) => {
        const app = (document.getElementById("app") as any).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        store.setCurrentFrame({id: id.frameId, caretPosition: id.caretPosition});
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
    }, {frameId, caretPosition});
}

async function getToneCount(page: import("@playwright/test").Page): Promise<number> {
    return await page.evaluate(() => (window as unknown as {editorToneStarts: unknown[]}).editorToneStarts.length);
}
