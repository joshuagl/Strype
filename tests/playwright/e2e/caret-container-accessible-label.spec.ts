import {expect, test} from "@playwright/test";
import {setupStrypeTest} from "../support/general";

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
