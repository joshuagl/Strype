import {expect, test} from "@playwright/test";
import {setupStrypeTest} from "../support/general";
import {enterCode, pressFrameShortcut, waitForEditorSettled} from "../support/editor";

test.beforeEach(async ({page, browserName}, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
});

test("describes the next frame at each frame-caret position", async ({page}) => {
    const focusInputs = page.locator(".caret-container-focus-input-wrapper input");
    await expect(focusInputs.first()).toHaveAttribute("aria-label", /.+/);

    const labels = await focusInputs.evaluateAll((inputs) => inputs.map((input) => input.getAttribute("aria-label") ?? ""));
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(labels.join(" ")).toContain("myString");
});

test("updates the focused caret label after moving down", async ({page}) => {
    await page.locator("#caret_caretBody_of_frame_-3_focusInput").focus();
    await page.keyboard.press("ArrowDown");

    const focusedInput = page.locator(".caret-container-focus-input-wrapper input:focus");
    await expect(focusedInput).toHaveAttribute("aria-label", /Next frame:/);
    await expect(focusedInput).not.toHaveAttribute("aria-label", "Next frame: frame");
});

test("includes comment text in the next-frame label", async ({page}) => {
    await enterCode(page, ["", "def demo():\n    value = 1\n    # read this comment\n    return value", ""]);

    const labels = await page.locator(".caret-container-focus-input-wrapper input")
        .evaluateAll((inputs) => inputs.map((input) => input.getAttribute("aria-label") ?? ""));
    expect(labels.some((label) => label.includes("comment: read this comment") && label.includes("within def demo"))).toBe(true);
});

test("describes the body of a control structure at its final frame", async ({page}) => {
    await page.keyboard.press("ArrowDown"); // Imports -> Definitions
    await page.keyboard.press("ArrowDown"); // Definitions -> Main
    await page.keyboard.press(" ");
    await page.keyboard.press("f");
    await waitForEditorSettled(page);

    const forId = await page.locator("#editor").getAttribute("data-slot-focus-id").then((focusId) => {
        const match = focusId?.match(/^input_frame_(-?\d+)_/);
        if (!match) {
            throw new Error(`No frame slot is focused (data-slot-focus-id="${focusId}")`);
        }
        return Number(match[1]);
    });
    await page.keyboard.type("ch");
    await page.keyboard.press("ArrowRight");
    await page.keyboard.type("myString");
    await waitForEditorSettled(page);
    await page.locator(`#frameBodyId_${forId}`).click();
    await pressFrameShortcut(page, "p");
    await waitForEditorSettled(page);

    const lastBodyFrameId = await page.evaluate((forId) => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const forFrame = store.frameObjects[forId];
        return forFrame.childrenIds.at(-1) as number | undefined;
    }, forId);
    expect(lastBodyFrameId).toBeDefined();

    const endCaretLabel = page.locator(`#caret_caretBelow_of_frame_${lastBodyFrameId}_focusInput`);
    await expect(endCaretLabel).toHaveAttribute("aria-label", "Next position: body of for ch in myString");
});

test("describes the end of a container", async ({page}) => {
    const endCaretLabels = await page.evaluate(() => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const mainContainer = store.frameObjects[-3];
        const lastMainFrameId = mainContainer.childrenIds.at(-1) as number;
        const emptyDefinitionsContainerId = store.frameObjects[-2].id as number;
        return {lastMainFrameId, emptyDefinitionsContainerId};
    });

    await expect(page.locator(`#caret_caretBelow_of_frame_${endCaretLabels.lastMainFrameId}_focusInput`))
        .toHaveAttribute("aria-label", "End of My code container");
    await expect(page.locator(`#caret_caretBody_of_frame_${endCaretLabels.emptyDefinitionsContainerId}_focusInput`))
        .toHaveAttribute("aria-label", "End of Definitions container");
});
