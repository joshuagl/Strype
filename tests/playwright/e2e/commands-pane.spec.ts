import {expect, test} from "@playwright/test";
import {setupStrypeTest} from "../support/general";
import {assertStateOfIfFrame, pressFrameShortcut, typeIndividually, waitForEditorSettled} from "../support/editor";

test.beforeEach(async ({ page, browserName }, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
});

// The default starter project always has a "myString = "Hello from Strype"" assignment followed
// by a "print(myString)" call -- these give us a plain code slot (the "myString" argument to
// print) and a string literal slot ("Hello from Strype") to focus/select in the tests below.
function getPlainCodeSlot(page: import("@playwright/test").Page) {
    return page.locator(".label-slot-input").filter({hasText: /^myString$/}).last();
}

function getStringLiteralSlot(page: import("@playwright/test").Page) {
    return page.locator(".label-slot-input").filter({hasText: "Hello"}).first();
}

test.describe("Frame commands pane -- frame cursor", () => {
    test("shows the basic frame commands, without elif/else, at an empty line", async ({page}) => {
        await expect(page.locator("#addFrameCmd_if")).toBeVisible();
        await expect(page.locator("#addFrameCmd_elif")).toHaveCount(0);
        await expect(page.locator("#addFrameCmd_else")).toHaveCount(0);
    });

    test("announces the type of frame inserted", async ({page}) => {
        await pressFrameShortcut(page, "i");

        await expect(page.getByRole("status").first()).toHaveText("Inserted frame type: if");
    });

    test("shows elif/else once positioned after an if frame", async ({page}) => {
        await pressFrameShortcut(page, "i");
        await waitForEditorSettled(page);
        // Leave the condition slot -- the frame cursor lands right after the if frame, where
        // joint (elif/else) frames become valid additions:
        await page.keyboard.press("Escape");
        await waitForEditorSettled(page);

        await expect(page.locator("#addFrameCmd_elif")).toBeVisible();
        await expect(page.locator("#addFrameCmd_else")).toBeVisible();
    });
});

test.describe("Commands pane -- code completion shortcut", () => {
    test("shown while editing a plain code slot", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await getPlainCodeSlot(page).click();

        await expect(panel).toContainText("Code completion");
        await expect(panel).not.toContainText("file paths");
    });

    test("shown with the file-paths label while editing a string literal slot", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await getStringLiteralSlot(page).click();

        await expect(panel).toContainText("Code completion (file paths)");
    });

    test("not shown while editing a comment", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type("hello world");

        await expect(panel).not.toContainText("Code completion");
    });
});

test.describe("Commands pane -- add-frame-commands column wrapping", () => {
    // Regression tests for a bug where the add-frame-commands list (the "space"/"="/"if"/etc.
    // buttons shown at a blank frame-insert caret) wrapped into more columns than the pane was
    // wide enough for, cutting off the rightmost one(s). The list wraps into columns via CSS
    // (Commands.vue's ".add-frame-commands-list" grid rules) once it doesn't have room to show
    // everything in one column; that in turn needs the list to have an actual, non-auto CSS
    // height to wrap against, which now comes from an ordinary flex-grow chain rather than a
    // JS-measured pixel height pinned only on splitter-resize/PEA-expand-collapse events. The old
    // JS approach went stale the moment the *content* changed instead -- e.g. moving the frame
    // cursor from the imports section (few commands) to "My code" (many) -- reusing a height sized
    // for the old, shorter list and wrapping the new, longer one into far more columns than the
    // pane was wide enough for.
    //
    // A short viewport is used throughout so the list only has room for a couple of rows,
    // deterministically forcing it to wrap into several columns regardless of font metrics.

    // Fixed frame IDs from the default starter project (src/store/initial-states/initial-python-state.ts):
    // 2 is the second import frame ("from strype.sound import *"), 4 is the last "My code" frame
    // (the "print(myString)" call). Clicking a caret container directly (rather than clicking into
    // a slot and pressing Escape) is the same reliable technique paste-joint-frames.spec.ts uses --
    // it sidesteps any browser-specific differences in what a slot click selects/focuses.
    const SECOND_IMPORT_FRAME_ID = 2;
    const LAST_MY_CODE_FRAME_ID = 4;

    async function clickBelowCaret(page: import("@playwright/test").Page, frameId: number): Promise<void> {
        const id = "caret_caretBelow_of_frame_" + frameId;
        await page.evaluate((id) => {
            document.getElementById(id)?.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true}));
        }, id);
        await waitForEditorSettled(page);
    }

    async function moveCaretToEndOfSecondImportFrame(page: import("@playwright/test").Page) {
        await clickBelowCaret(page, SECOND_IMPORT_FRAME_ID);
    }

    async function moveCaretToEndOfMyCode(page: import("@playwright/test").Page) {
        await clickBelowCaret(page, LAST_MY_CODE_FRAME_ID);
    }

    test("wrapping into more columns after navigating to a section with more commands doesn't cut any of them off", async ({page}) => {
        await page.setViewportSize({width: 1000, height: 320});

        // Insert a frame in the (short) imports section, matching the reported repro, then move
        // to the "My code" section, which offers many more add-frame commands than imports does.
        await moveCaretToEndOfSecondImportFrame(page);
        await pressFrameShortcut(page, "i");
        await waitForEditorSettled(page);
        await page.keyboard.press("Escape");
        await waitForEditorSettled(page);
        await moveCaretToEndOfMyCode(page);

        const list = page.locator("#addFramePanel .add-frame-commands-list");

        // Read everything relevant in a single synchronous snapshot: separate round-tripped
        // boundingBox() calls (one per command) risk a Vue re-render landing between them and
        // reporting on a moving target.
        const snapshot = await list.evaluate((el) => {
            const listRect = el.getBoundingClientRect();
            const commandRects = [...el.querySelectorAll(".frame-cmd-container")].map((c) => c.getBoundingClientRect());
            return {
                listLeft: listRect.left,
                scrollWidth: el.scrollWidth,
                commandCount: commandRects.length,
                commandRects: commandRects.map((r) => ({left: r.left, width: r.width, height: r.height})),
            };
        });
        expect(snapshot.commandCount).toBeGreaterThan(5); // sanity check: this really is the many-commands case

        for (const rect of snapshot.commandRects) {
            // Every command must be present with a real, positive size (not collapsed/hidden)...
            expect(rect.width).toBeGreaterThan(0);
            expect(rect.height).toBeGreaterThan(0);
            // ...and reachable within the list's own scrollable area -- not off in unreachable
            // space to the right of it (the original bug: extra columns bled out past the pane
            // with no way to scroll to them at all).
            expect(rect.left - snapshot.listLeft + rect.width).toBeLessThanOrEqual(snapshot.scrollWidth + 1);
        }

        // And the overflow must be contained within the list itself (which is scrollable, via
        // overflow-x: auto) rather than bleeding out into a pane- or page-level scrollbar the way
        // the old, unbounded flex-wrap did.
        const noPEACommandsOverflow = await page.locator(".no-pea-commands").evaluate(
            (el) => el.scrollWidth - el.clientWidth
        );
        expect(noPEACommandsOverflow).toBeLessThanOrEqual(1);
    });

    test("the list re-wraps for a smaller section without needing a resize in between", async ({page}) => {
        await page.setViewportSize({width: 1000, height: 320});

        const list = page.locator("#addFramePanel .add-frame-commands-list");

        await moveCaretToEndOfMyCode(page);
        const manyCommandsColumnCount = await list.evaluate((el) => {
            const lefts = new Set([...el.children].map((c) => (c as HTMLElement).offsetLeft));
            return lefts.size;
        });

        await moveCaretToEndOfSecondImportFrame(page);
        const fewCommandsColumnCount = await list.evaluate((el) => {
            const lefts = new Set([...el.children].map((c) => (c as HTMLElement).offsetLeft));
            return lefts.size;
        });

        // No window resize (nor PEA expand/collapse) happened between the two navigations above --
        // if the list's column count didn't change, it's still using the old section's layout.
        expect(fewCommandsColumnCount).toBeLessThan(manyCommandsColumnCount);
    });

    test("emptying the list while editing doesn't push the code-completion hint down or off-screen", async ({page}) => {
        // A short viewport so the (not-editing) list needs several columns, matching the shape of
        // the original bug -- the list is a flex-grow item, so without special handling for its
        // empty (editing) state it would keep taking up the same vertical space even with no
        // commands in it, pushing the hints below it down by that amount.
        await page.setViewportSize({width: 1000, height: 320});
        await moveCaretToEndOfMyCode(page);

        const panel = page.locator("#addFramePanel");
        const completionHint = panel.getByText("Code completion", {exact: false});
        const peaPane = page.locator("#peaTabContentContainerDiv");

        await getPlainCodeSlot(page).click();
        await waitForEditorSettled(page);

        await expect(panel).toContainText("Code completion");

        const hintBox = await completionHint.boundingBox();
        const peaBox = await peaPane.boundingBox();
        expect(hintBox).not.toBeNull();
        expect(peaBox).not.toBeNull();
        expect((hintBox?.y ?? 0) + (hintBox?.height ?? 0)).toBeLessThanOrEqual(peaBox?.y ?? 0);
    });
});

test.describe("Commands pane -- slot shortcuts pane (Space at an empty slot)", () => {
    test("shown as a hint while a plain empty code slot is focused", async ({page}) => {
        await pressFrameShortcut(page, "i");
        await waitForEditorSettled(page);
        const panel = page.locator("#addFramePanel");

        await expect(panel).toContainText("Record image");
        await expect(panel).toContainText("Record sound");
        await expect(panel).toContainText("Colour picker");
    });

    test("not shown once the slot has content", async ({page}) => {
        await pressFrameShortcut(page, "i");
        await waitForEditorSettled(page);
        await page.keyboard.type("1");
        await waitForEditorSettled(page);

        await expect(page.locator("#addSlotShortcutsPanel")).toHaveCount(0);
    });

    test("not shown inside a string literal slot", async ({page}) => {
        await pressFrameShortcut(page, "i");
        await waitForEditorSettled(page);
        await page.keyboard.type("\"");
        await waitForEditorSettled(page);

        await expect(page.locator("#addSlotShortcutsPanel")).toHaveCount(0);
    });

    test("not shown inside an (empty) comment", async ({page}) => {
        await page.keyboard.press("#");
        await waitForEditorSettled(page);

        await expect(page.locator("#addSlotShortcutsPanel")).toHaveCount(0);
    });

    test("pressing space focuses the first shortcut button, and arrow keys cycle between them", async ({page}) => {
        await pressFrameShortcut(page, "i");
        await waitForEditorSettled(page);

        await page.keyboard.press(" ");
        const buttons = page.locator("#addSlotShortcutsPanel .frame-cmd-btn");
        await expect(buttons).toHaveCount(3);
        await expect(buttons.nth(0)).toBeFocused();

        await page.keyboard.press("ArrowDown");
        await expect(buttons.nth(1)).toBeFocused();
        await page.keyboard.press("ArrowUp");
        await expect(buttons.nth(0)).toBeFocused();
    });

    test("escape closes the pane and returns the cursor to the (still empty) slot", async ({page}) => {
        await pressFrameShortcut(page, "i");
        await waitForEditorSettled(page);

        await page.keyboard.press(" ");
        const firstButton = page.locator("#addSlotShortcutsPanel .frame-cmd-btn").first();
        await expect(firstButton).toBeFocused();
        await expect(firstButton).not.toHaveClass(/frame-cmd-greyed/);

        await page.keyboard.press("Escape");
        await waitForEditorSettled(page);
        // The pane itself must be closed (back to its plain, greyed-out hint state)...
        await expect(firstButton).not.toBeFocused();
        await expect(firstButton).toHaveClass(/frame-cmd-greyed/);
        // ...and the cursor must be back in the slot, ready to type, with no extra click needed:
        await typeIndividually(page, "9");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{9$}", []);
    });

    test("pressing space again while the pane is focused closes it and returns to the slot", async ({page}) => {
        await pressFrameShortcut(page, "i");
        await waitForEditorSettled(page);

        await page.keyboard.press(" ");
        const firstButton = page.locator("#addSlotShortcutsPanel .frame-cmd-btn").first();
        await expect(firstButton).toBeFocused();

        await page.keyboard.press(" ");
        await waitForEditorSettled(page);
        await expect(firstButton).not.toBeFocused();
        await expect(firstButton).toHaveClass(/frame-cmd-greyed/);
        await typeIndividually(page, "9");
        await waitForEditorSettled(page);
        await assertStateOfIfFrame(page, "{9$}", []);
    });
});

test.describe("Commands pane -- wrap-selection shortcuts", () => {
    test("shown for a selection inside a plain code slot", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await getPlainCodeSlot(page).dblclick();

        await expect(panel).toContainText("Wrap in ()");
        await expect(panel).toContainText("Wrap in []");
        await expect(panel).toContainText("Wrap in {}");
        await expect(panel).toContainText("Wrap in \"");
        await expect(panel).toContainText("Wrap in '");

        // Collapsing the selection back to a plain cursor should hide them again:
        await page.keyboard.press("ArrowRight");
        await expect(panel).not.toContainText("Wrap in");
    });

    test("not shown for a selection inside a string literal slot", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await getStringLiteralSlot(page).dblclick();

        await expect(panel).toContainText("Code completion (file paths)");
        await expect(panel).not.toContainText("Wrap in");
    });

    test("not shown for a selection inside a comment", async ({page}) => {
        const panel = page.locator("#addFramePanel");
        await page.keyboard.press("#");
        await waitForEditorSettled(page);
        await page.keyboard.type("hello world");
        await waitForEditorSettled(page);
        await page.keyboard.press("Home");
        await page.keyboard.down("Shift");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.press("ArrowRight");
        await page.keyboard.up("Shift");

        await expect(panel).not.toContainText("Wrap in");
        await expect(panel).not.toContainText("Code completion");
    });
});
