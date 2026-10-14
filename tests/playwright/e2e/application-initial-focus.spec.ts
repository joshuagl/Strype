import {expect, test} from "@playwright/test";
import {setupStrypeTest} from "../support/general";
import {pressFrameShortcut, waitForEditorSettled} from "../support/editor";

test.beforeEach(async ({page, browserName}, testInfo) => {
    await setupStrypeTest(page, browserName, testInfo, {skipPyodide: true});
});

test("focuses the application on load and accepts keyboard input immediately", async ({page}) => {
    const application = page.getByRole("application");
    await expect(application).toBeFocused();

    const initialFrameCount = await page.locator(".frame-div").count();
    await pressFrameShortcut(page, "i");
    await waitForEditorSettled(page);

    await expect(page.locator(".frame-div")).toHaveCount(initialFrameCount + 1);
});
