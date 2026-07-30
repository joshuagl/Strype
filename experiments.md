# A running log of experiments in the `exp-sr-naive-approach` branch

## 2026-08-06

### Existing state

Before making any changes, to Strype (i.e., using `main` at commitish `7fcb440d`) interacting with Strype via a screen reader (NVDA) is not useful.
In Focus mode, the caret moves with the keyboard keys. However, the screen reader only ever speaks "section". "section section section section"

In browse mode, the screen arrow keys move through focusable areas (I think) and for the code: `score <= results[0]`, the following is narrated:
> clickable section multi line editable score
> <press down>
> out of section is implied by
> <pres down>
> section multi line editable results
> clickable
> zero
> clickable
> blank

### Initial, naive, change

With the naive implementation, of having `role="application"` on the div wrapping the split pane and having a simple `aria-label` label for frame `<divs>`, we get results as follows.
Aside: adding `role="application"` to main `<BApp>` container did not seem to work. Strype was still in browse mode. It's currently unclear why this happened.

With `role="application"` on an appropriate container, NVDA will no longer use browse mode for the editor. This is already a significant win!

The simple label, the parsed Python for the frame, is presented by the screen reader when moving the frame cursor. Presented speech is for the frame _above_ the frame cursor, where what we would like is the frame _below_ the frame cursor.

Note also that:
- for parent frames, the entire contents of all child frames is presented - this may not be desirable? This is most notably "off" for `match` frames, each case of the `match` is only presented as the case + it's child statements
- for parent frames, the entire contents of all child frames is presented at the end insertion point. For example, after a function definition frame the frame cursor landing after the frame (potentially between another frame or potentially at the end of the Definitions container) will present the entire code contents of the previous frame
- each frame presentation ends with ~"section"~ "text frame", this trait of NVDA is particularly annoying for a web application
- focus isn't quite right on first load - we need to tab away and tab back for the arrow keys to move the frame cursor
- need to be able to tab to Graphics, Console, and Run in order to be fully keyboard accessible

As well as all of the above "buggy" behaviour, we also need a non-naive presentation of a frame's contents. This is perhaps the most significant problem to solve.
