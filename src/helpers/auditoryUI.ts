import { AllFrameTypesIdentifier, FrameObject, ContainerTypesIdentifiers } from "@/types/types";
import { useStore } from "@/store/store";
import Parser from "@/parser/parser";

export function humanReadableFrameType(frameType: string): string {
    // TODO(JGL): we need to localise frame types and return an appropriate
    // name in the user's natural language
    // i18n.global.t("frame.comment_desc"),
    switch (frameType) {
    case AllFrameTypesIdentifier.funccall:
        return "function call";
    case AllFrameTypesIdentifier.funcdef:
        return "function definition";
    case AllFrameTypesIdentifier.fromimport:
        // TODO(JGL): very uncertain about this one...
        return "import";
    case AllFrameTypesIdentifier.varassign:
        return "assignment";
    case AllFrameTypesIdentifier.match:
        return "match";
    /*
     * Frame containers are presented when we hit the top, and may be presented when we
     * respond to a "where am I?" command.
     */
    // TODO(JGL): we need to localise container types
    case ContainerTypesIdentifiers.importsContainer:
        return "imports";
    case ContainerTypesIdentifiers.defsContainer:
        return "definitions";
    case ContainerTypesIdentifiers.framesMainContainer:
        return "my code";
    default:
        return frameType;
    }
}

/**
 * Translate the given frame into an auditory representation.
 *
 * @param {FrameObject} frame to translate into an auditory presentation
 * @returns {string} the textual presentation of the frame for narration by a screen reader
 */
export function frameToAuditoryPresentation(frame: FrameObject): string {
    // TODO: we should have a shared parser, rather than creating one per CaretContainer
    // Our long-term solution may be modelled after src/autocompletion to provide a label
    // generator? :thinking:
    const parser = new Parser(false, "py", true);
    const parentFrame = useStore().frameObjects[frame.parentId];

    const frameType = humanReadableFrameType(frame.frameType.type);

    // Current frame is always wanted
    const parsedCurrentFrame = parser.parse({
        startAtFrameId: frame.id,
        stopAt: {frameId: frame.id,
            includeThisFrame: true},
        excludeComments: false
    });

    // Class or function or loop, we'll want to narrate "context"
    let provideContext;
    switch (parentFrame.frameType.type) {
    case AllFrameTypesIdentifier.funcdef:
    case AllFrameTypesIdentifier.classdef:
    case AllFrameTypesIdentifier.for:
    case AllFrameTypesIdentifier.if:
    case AllFrameTypesIdentifier.elif:
    case AllFrameTypesIdentifier.else:
    case AllFrameTypesIdentifier.try:
    case AllFrameTypesIdentifier.except:
    case AllFrameTypesIdentifier.finally:
    case AllFrameTypesIdentifier.match:
    case AllFrameTypesIdentifier.while:
        provideContext = true;
        break;
    default:
        provideContext = false;
    }

    let returnedLabel = frameType + " with code " + parsedCurrentFrame;
    if (provideContext) {
        returnedLabel += "in " + humanReadableFrameType(parentFrame.frameType.type);
    }
    return returnedLabel;
}

export function auditoryEvent(event: string): void {
    const messageArea = document.getElementById("aui-timely-notifications");
    if (messageArea) {
        // TODO: we should also announce what is the active cursor type and where the focus is
        messageArea.textContent = "";
        setTimeout(() => (messageArea.textContent = event), 50);
    }
}

export function isContainerFrame(frame: FrameObject): boolean {
    switch (frame.frameType.type) {
    case ContainerTypesIdentifiers.importsContainer:
    case ContainerTypesIdentifiers.defsContainer:
    case ContainerTypesIdentifiers.framesMainContainer:
        return true;
    default:
        return false;
    }
}
