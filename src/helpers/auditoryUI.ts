import {AllFrameTypesIdentifier} from "@/types/types";

export function humanReadableFrameType(frameType: string): string {
    // TODO(JGL): we need to localise frame types and return an appropriate
    // name in the user's natural language
    // i18n.global.t("frame.comment_desc"),
    switch (frameType) {
    case AllFrameTypesIdentifier.funccall:
        return "function call";
    case AllFrameTypesIdentifier.varassign:
        return "assignment";
    default:
        return frameType;
    }
}
