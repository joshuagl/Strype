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

    const firstCaretInput = page.locator("#caret_caretBody_of_frame_-3_focusInput");
    await expect(firstCaretInput).toHaveAttribute("aria-label", /Frame 3$/);
    await expect(firstCaretInput).toHaveValue("\u200B");
});

test("announces when the next frame is disabled", async ({page}) => {
    await enterCode(page, ["", "", "someCall()"]);
    await waitForEditorSettled(page);
    await page.evaluate(async () => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        if (!store) {
            throw new Error("Could not access the app store");
        }
        const firstMainFrameId = store.frameObjects[-3].childrenIds[0];
        store.frameObjects[firstMainFrameId].isDisabled = true;
        store.setCurrentFrame({id: -3, caretPosition: "caretBody"});
        await new Promise(requestAnimationFrame);
    });

    const input = page.locator("#caret_caretBody_of_frame_-3_focusInput");
    await expect(input)
        .toHaveAttribute("aria-label", /^Next frame disabled, .+ Frame 1$/);
    await input.focus();
    await expect(input).toHaveValue("\u200B");
});

test("marks a next frame with a frame error", async ({page}) => {
    await enterCode(page, ["", "", "print('Brrrrrrr')"]);
    const nextFrameId = await page.evaluate(async () => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const nextFrameId = store.frameObjects[-3].childrenIds[0];
        store.frameObjects[nextFrameId].runTimeError = "Example runtime issue";
        store.setCurrentFrame({id: nextFrameId, caretPosition: "caretBelow"});
        await new Promise(requestAnimationFrame);
        store.setCurrentFrame({id: -3, caretPosition: "caretBody"});
        await new Promise(requestAnimationFrame);
        return nextFrameId as number;
    });

    const input = page.locator("#caret_caretBody_of_frame_-3_focusInput");
    const nextFrame = page.locator(`#frame_id_${nextFrameId}`);
    const errorDetailsId = `runtimeErrorDescription_frame_${nextFrameId}`;
    const slotCursor = page.locator(`#labelSlotsStruct${nextFrameId}_0`);
    await expect(input).toHaveAttribute("aria-label", /frame with an issue/);
    await expect(input).toHaveAttribute("aria-details", errorDetailsId);
    await expect(nextFrame).toHaveAttribute("role", "mark");
    await expect(nextFrame).toHaveAttribute("aria-details", errorDetailsId);
    await expect(page.locator(`#${errorDetailsId}`)).toContainText("Example runtime issue");
    await slotCursor.focus();
    await expect(slotCursor).toHaveAttribute("aria-details", errorDetailsId);
    await expect(slotCursor.locator("[id^='input_frame_']").first()).toHaveAttribute("aria-details", errorDetailsId);
});

test("clears stale slot error details while editing", async ({page}) => {
    await enterCode(page, ["", "", "print('Brrrrrrr')"]);
    const {nextFrameId, labelIndex, slotUID, slotErrorDescriptionUID} = await page.evaluate(async () => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const nextFrameId = store.frameObjects[-3].childrenIds[0];
        const labelIndex = Number(Object.keys(store.frameObjects[nextFrameId].labelSlotsDict)[0]);
        const slot = store.getFlatSlotBases(nextFrameId, labelIndex)[0];
        const slotUID = `input_frame_${nextFrameId}_label_${labelIndex}_slot_${slot.type.toString(8).padStart(8, "0")}_${slot.id}`;
        store.setSlotErroneous({
            frameId: nextFrameId,
            labelSlotsIndex: labelIndex,
            slotId: slot.id,
            slotType: slot.type,
            error: "Example slot issue",
            errorTitle: "Slot error",
        });
        const slotCursorInfos = {
            slotInfos: {
                frameId: nextFrameId,
                labelSlotsIndex: labelIndex,
                slotId: slot.id,
                slotType: slot.type,
            },
            cursorPos: 0,
        };
        store.setSlotTextCursors(slotCursorInfos, slotCursorInfos);
        store.setCurrentFrame({id: -3, caretPosition: "caretBody"});
        await new Promise(requestAnimationFrame);
        return {
            nextFrameId: nextFrameId as number,
            labelIndex,
            slotUID,
            slotErrorDescriptionUID: `errorDescription_${slotUID}`,
        };
    });
    const input = page.locator("#caret_caretBody_of_frame_-3_focusInput");
    const nextFrame = page.locator(`#frame_id_${nextFrameId}`);
    const slotCursor = page.locator(`#labelSlotsStruct${nextFrameId}_${labelIndex}`);
    const editableSlot = slotCursor.locator(`#${slotUID}`);
    await expect(input).toHaveAttribute("aria-label", /frame with an issue/);
    await expect(input).toHaveAttribute("aria-details", slotErrorDescriptionUID);
    await expect(nextFrame).toHaveAttribute("role", "mark");
    await expect(nextFrame).toHaveAttribute("aria-details", slotErrorDescriptionUID);
    await expect(slotCursor).toHaveAttribute("aria-details", slotErrorDescriptionUID);
    await expect(slotCursor.locator("[id^='input_frame_']").first()).toHaveAttribute("aria-details", slotErrorDescriptionUID);
    await expect(page.locator(`#${slotErrorDescriptionUID}`)).toContainText("Example slot issue");

    await editableSlot.click();
    await page.keyboard.press("End");
    await page.keyboard.type("x");
    await expect(input).not.toHaveAttribute("aria-label", /frame with an issue/);
    await expect(input).not.toHaveAttribute("aria-details");
    await expect(nextFrame).not.toHaveAttribute("role", "mark");
    await expect(nextFrame).not.toHaveAttribute("aria-details");
    await expect(page.locator(`#${slotErrorDescriptionUID}`)).toHaveCount(0);

    await page.keyboard.type("#");
    await page.keyboard.press("ArrowRight");
    await waitForEditorSettled(page);
    await expect(nextFrame).toHaveAttribute("role", "mark");
    const restoredDetailsId = await nextFrame.getAttribute("aria-details");
    expect(restoredDetailsId).not.toBeNull();
    await expect(page.locator(`#${restoredDetailsId}`)).toHaveCount(1);
});

test("clears precompile diagnostics when slot content changes", async ({page}) => {
    await enterCode(page, ["", "", "print('Brrrrrrr')"]);
    const result = await page.evaluate(async () => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const frameId = store.frameObjects[-3].childrenIds[0];
        const labelIndex = Number(Object.keys(store.frameObjects[frameId].labelSlotsDict)[0]);
        const slot = store.getFlatSlotBases(frameId, labelIndex)[0];
        const slotUID = `input_frame_${frameId}_label_${labelIndex}_slot_${slot.type.toString(8).padStart(8, "0")}_${slot.id}`;
        store.setSlotErroneous({
            frameId,
            labelSlotsIndex: labelIndex,
            slotId: slot.id,
            slotType: slot.type,
            error: "Example precompile issue",
        });
        store.addPreCompileErrors(slotUID);
        await store.setFrameEditableSlotContent({
            frameId,
            labelSlotsIndex: labelIndex,
            slotId: slot.id,
            slotType: slot.type,
            code: `${slot.code}x`,
            initCode: slot.code,
            isFirstChange: true,
        });
        return {
            hasError: Boolean(slot.error),
            hasErrorTitle: slot.errorTitle !== undefined,
            hasPrecompileError: store.preCompileErrors.includes(slotUID),
        };
    });

    expect(result).toEqual({hasError: false, hasErrorTitle: false, hasPrecompileError: false});
});

test("updates the focused caret label after moving down", async ({page}) => {
    const originalInput = page.locator("#caret_caretBody_of_frame_-3_focusInput");
    await originalInput.focus();
    await expect(originalInput).toHaveAttribute("aria-label", /Frame 3$/);
    await page.keyboard.press("ArrowDown");

    const focusedInput = page.locator(".caret-container-focus-input-wrapper input:focus");
    await expect(focusedInput).toHaveAttribute("aria-label", /Next frame:.+ Frame 4$/);
    await expect(focusedInput).toHaveValue("\u200B");
    await expect(originalInput).toHaveValue("\u200B");
});

test("refreshes frame cursor numbers when visual frame order changes", async ({page}) => {
    const firstMainFrameId = await page.evaluate(() => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        const mainFrameIds = store.frameObjects[-3].childrenIds;
        if (mainFrameIds.length < 2) {
            throw new Error("The main section needs at least two frames to test renumbering");
        }
        return mainFrameIds[0] as number;
    });

    const input = page.locator(`#caret_caretBelow_of_frame_${firstMainFrameId}_focusInput`);
    const originalLabel = await input.getAttribute("aria-label");
    await page.evaluate(() => {
        const app = (document.getElementById("app") as unknown as {__vue_app__: {config: {globalProperties: {$pinia: {_s: Map<string, any>}}}}}).__vue_app__;
        const store = app.config.globalProperties.$pinia._s.get("app");
        store.frameObjects[-3].childrenIds.reverse();
    });
    await expect(input).not.toHaveAttribute("aria-label", originalLabel ?? "");
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
    await expect(endCaretLabel).toHaveAttribute("aria-label", "Next position: body of for ch in myString Frame 5");
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
