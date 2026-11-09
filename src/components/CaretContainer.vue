<template>
    <div
        :class="{[scssVars.caretContainerClassName]: true, 'static-caret-container': isStaticCaretContainer, [scssVars.draggingFrameClassName]: areFramesDraggedOver}"
        @click.exact.prevent.stop="toggleCaret()"
        @contextmenu.prevent.stop="handleClick($event)"
        :key="UID"
        :id="UID"
        tabindex="-1"
    >
        <!--
            This input is the real DOM focus target for a frame cursor, so that browsers (Safari/WebKit)
            see a genuine editable element under the caret and dispatch native clipboard "paste" events.
            It is visually hidden, not part of the tab order, and never keeps user-typed content.
        -->
        <div class="caret-container-focus-input-wrapper">
            <input
                type="text"
                class="visually-hidden"
                :id="focusInputUID"
                tabindex="-1"
                autocomplete="off"
                autocorrect="off"
                autocapitalize="off"
                spellcheck="false"
                inputmode="none"
                :value="frameCursorInputValue"
                :aria-label="frameCursorAccessibleLabel"
                :aria-details="frameCursorDetailsUID"
                @input="clearFocusInputContent"
            />
        </div>
        <ContextMenu
            :contextMenuItemsDef="frameContextMenuItems"
            :showContextMenu="showContextMenu"
            :showAt="showContextMenuAtCoordPos"
            :onOpened="handleContextMenuOpened"           
            :onClosed="handleContextMenuClosed"
        />
        <Caret
            :class="scssVars.navigationPositionClassName + ' ' + scssVars.caretClassName"
            :id="caretUID"
            :isInvisible="isInvisible"
            v-blur="isCaretBlurred"
            :areFramesDraggedOver="areFramesDraggedOver"
            :areDropFramesAllowed="areDropFramesAllowed"
            :isDuplicateDnDAction="isDuplicateDnDAction"
        />
    </div>
</template>


<script lang="ts">
//////////////////////
//      Imports     //
//////////////////////
import { defineComponent, PropType } from "vue";
import { settingsStore, useStore } from "@/store/store";
import Caret from"@/components/Caret.vue";
import {AllFrameTypesIdentifier, AllowedSlotContent, CaretPosition, Position, PythonExecRunningState, CollapsedState, StrypeContextMenuItem, CoordPosition, FrameObject, FrozenState, SlotType, ContainerTypesIdentifiers} from "@/types/types";
import { getCaretUID, setContextMenuEventClientXY, getAddFrameCmdElementUID, CustomEventTypes, getCaretContainerUID, getCaretContainerFocusInputUID, getEditorMiddleUID, slotStructureParserToString } from "@/helpers/editor";
import { mapStores } from "pinia";
import { cloneDeep } from "lodash";
import { pasteMixedPython } from "@/helpers/pythonToFrames";
import scssVars  from "@/assets/style/_export.module.scss";
import { vueComponentsAPIHandler } from "@/helpers/vueComponentAPI";
import { getAboveFrameCaretPosition, getNextFrameCaretPosition, getParentOrJointParent } from "@/helpers/storeMethods";
import { createOrGetAudioContext } from "@/helpers/audioContext";
// #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
import { getFrameDefType, MediaDataAndDim} from "@/types/types";
import { getFrameLabelSlotsStructureUID, getLabelSlotErrorDescriptionUID, getLabelSlotUID } from "@/helpers/editor";
import { preparePasteMediaData } from "@/helpers/media";
// #v-endif

const scopeFrameTypes = [
    AllFrameTypesIdentifier.if,
    AllFrameTypesIdentifier.elif,
    AllFrameTypesIdentifier.else,
    AllFrameTypesIdentifier.for,
    AllFrameTypesIdentifier.while,
    AllFrameTypesIdentifier.try,
    AllFrameTypesIdentifier.except,
    AllFrameTypesIdentifier.finally,
    AllFrameTypesIdentifier.with,
    AllFrameTypesIdentifier.match,
    AllFrameTypesIdentifier.case,
    AllFrameTypesIdentifier.classdef,
    AllFrameTypesIdentifier.funcdef,
];

const sectionContainerTypes = [
    ContainerTypesIdentifiers.importsContainer,
    ContainerTypesIdentifiers.defsContainer,
    ContainerTypesIdentifiers.framesMainContainer,
];

function getFrameCodeDescription(frame: FrameObject, mediaDescription: string, commentDescription: string): string {
    return (frame.frameType.labels ?? []).map((label, index) => {
        if (frame.labelSlotsDict[index]?.shown === false) {
            return "";
        }

        const slotStructure = frame.labelSlotsDict[index]?.slotStructures;
        const slotText = slotStructure
            ? slotStructureParserToString(slotStructure, {slotTypeRepacerMap: {[SlotType.media]: mediaDescription}}).join("").trim()
            : "";
        if (frame.frameType.type === AllFrameTypesIdentifier.comment) {
            return slotText ? `${commentDescription}: ${slotText}` : commentDescription;
        }
        if (label.allowedSlotContent === AllowedSlotContent.FREE_TEXT_DOCUMENTATION) {
            return "";
        }

        const labelText = label.showLabel === false ? "" : label.label
            // Replace HTML tags with spaces so adjacent words stay separate.
            .replace(/<[^>]*>/g, " ")
            // Convert non-breaking spaces to regular spaces.
            .replace(/&nbsp;/g, " ")
            // Decode hexadecimal HTML character references into unicode strings,
            // i.e. &#x21D0; becomes ⇐.
            .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint: string) => String.fromCodePoint(parseInt(codePoint, 16)));
        const content = label.showSlots === false ? "" : (slotText || label.defaultText);
        return labelText + content;
    // Collapse whitespace from joined labels and slots, then remove leading/trailing space.
    }).join("").replace(/\s+/g, " ").trim();
}

//////////////////////
//     Component    //
//////////////////////
export default defineComponent({
    name: "CaretContainer",

    components: {
        Caret,
    },

    created(){
        // Expose this component that other components might need.
        // Vue 3 has deprecated direct access to components.
        // (we don't set it in setup() because we want to have this accessible, and the component created!)
        const apiMethods = {
            setAreFramesDraggedOver: (value: boolean) => {
                this.areFramesDraggedOver = value;
            },
            getAreDropFramesAllowed: () => {
                return this.areDropFramesAllowed;
            },
            setAreDropFramesAllowed: (value: boolean) => {
                this.areDropFramesAllowed = value;
            },
            setIsDuplicateDnDAction: (value: boolean) => {
                this.isDuplicateDnDAction = value;
            },
            handleClick: this.handleClick,
        };
        
        if(vueComponentsAPIHandler.caretContainerComponentAPI == null){    
            vueComponentsAPIHandler.caretContainerComponentAPI = {
                forInstance: {
                    [this.UID]: apiMethods,
                },
            };
        }
        else{
            vueComponentsAPIHandler.caretContainerComponentAPI.forInstance[this.UID] = apiMethods;
        }
    },

    props: {
        frameId: {type: Number, required: true},
        caretVisibility: String, //Flag indicating this caret is visible or not
        caretAssignedPosition: {
            type: String as PropType<CaretPosition>,
            required: true,
        },
        isFrameDisabled: Boolean,
    },

    watch: {
        currentCaretPositionKey: {
            handler() {
                this.updateAccessibleLabel();
                if (this.frameId === this.appStore.currentFrame.id
                    && this.caretAssignedPosition === this.appStore.currentFrame.caretPosition) {
                    this.playWarningToneForNextFrame();
                }
            },
            flush: "post",
        },
        nextFrameWarningKey: {
            handler() {
                this.updateAccessibleLabel();
            },
            flush: "post",
        },
        frameVisualNumbersKey: {
            handler() {
                this.updateFrameCursorInputValue();
            },
            flush: "post",
        },
    },

    computed: {
        ...mapStores(useStore, settingsStore),

        currentCaretPositionKey(): string {
            return `${this.appStore.currentFrame.id}:${this.appStore.currentFrame.caretPosition}`;
        },

        nextFrameWarningKey(): string {
            const {frame, warning} = this.getNextFrameInfo();
            return `${frame?.id ?? ""}:${warning.hasWarning}:${warning.detailsUID ?? ""}`;
        },

        frameCursorAccessibleLabel(): string {
            return [this.accessibleLabel, this.frameCursorNumberLabel].filter(Boolean).join(" ");
        },

        frameVisualNumbersKey(): string {
            return Object.entries(this.appStore.getFrameVisualNumbers)
                .map(([frameId, number]) => `${frameId}:${number}`)
                .join(",");
        },
        
        isEditing(): boolean {
            return this.appStore.isEditing;
        },

        isInvisible(): boolean {
            // The caret is only visible when editing is off, 
            // and either one frame is currently selected 
            // OR when a frame or a frame selection is dragged over.
            return !(!this.isEditing && this.caretVisibility === this.caretAssignedPosition || this.areFramesDraggedOver); 
        },

        isStaticCaretContainer(): boolean {
            // Function definition frames are spaced, so we keep the caret container static (with the caret height) 
            // for such frames (meaning if there are more than 1 frame, all but last caret container should be static)
            const frameType = this.appStore.frameObjects[this.frameId].frameType.type;
            const parentFrame = this.appStore.frameObjects[this.appStore.frameObjects[this.frameId].parentId];
            return (
                // We are a class or function:
                (frameType == AllFrameTypesIdentifier.funcdef || frameType == AllFrameTypesIdentifier.classdef)
                // We're below a frame (i.e. not the top caret position in the container:
                && this.caretAssignedPosition == CaretPosition.below
                // We are one of multiple children, and not the last one:
                && parentFrame.childrenIds.length > 1 && parentFrame.childrenIds.at(-1) != this.frameId
                // And we and our neighbour following us are not both folded in (i.e. at least one of us is unfolded)
                && (((this.appStore.frameObjects[this.frameId].collapsedState ?? CollapsedState.FULLY_VISIBLE) != CollapsedState.ONLY_HEADER_VISIBLE)
                    // We know there is a frame after us because of the check we just did:
                    || ((this.appStore.frameObjects[parentFrame.childrenIds[parentFrame.childrenIds.indexOf(this.frameId) + 1]].collapsedState ?? CollapsedState.FULLY_VISIBLE) != CollapsedState.ONLY_HEADER_VISIBLE))
            );
        },

        // Needed in order to use the `CaretPosition` type in the v-show
        caretPosition(): typeof CaretPosition {
            return CaretPosition;
        },

        UID(): string {
            return getCaretContainerUID(this.caretAssignedPosition,this.frameId);
        },

        focusInputUID(): string {
            return getCaretContainerFocusInputUID(this.caretAssignedPosition, this.frameId);
        },

        caretUID(): string {
            return getCaretUID(this.caretAssignedPosition, this.frameId);
        },

        isPythonExecuting(): boolean {
            return (this.appStore.pythonExecRunningState ?? PythonExecRunningState.NotRunning) != PythonExecRunningState.NotRunning;
        },

        isCaretBlurred(): boolean {
            //if the frame isn't disabled, we never blur the caret. If the frame is disabled, then we check if frames can be added to decide if we blur or not.
            return this.isFrameDisabled && ((this.caretAssignedPosition ===  CaretPosition.below) ? !this.appStore.canAddFrameBelowDisabled(this.frameId) : true);
        },
        
        isFocusedForPaste(): boolean {
            return !this.isPythonExecuting && !this.appStore.isModalDlgShown && !this.isEditing && this.caretVisibility !== CaretPosition.none && (this.caretVisibility === this.caretAssignedPosition);
        },
    },

    data: function () {
        return {
            CustomEventTypes, // just for using in template
            scssVars, // just to be able to use in template
            insertFrameMenuItems: [] as StrypeContextMenuItem[],
            areFramesDraggedOver: false,
            areDropFramesAllowed: true,
            isDuplicateDnDAction: false,
            frameCursorInputValue: "\u200B", // Silent, non-empty value avoids NVDA announcing "blank".
            frameCursorNumberLabel: "",
            accessibleLabel: "",
            frameCursorDetailsUID: undefined as string | undefined,
            // Flag used to trigger the context menu opening
            showContextMenu: false,
            // Prepare an empty version of the menu: it will be updated as required in handleClick()
            frameContextMenuItems: [] as StrypeContextMenuItem[],
            showContextMenuAtCoordPos: {x: 0, y: 0} as CoordPosition,
        };
    },

    mounted() {
        window.addEventListener("paste", this.pasteIfFocused);
        document.addEventListener(CustomEventTypes.scrollCaretIntoView, this.onScrollCaretIntoView);
        this.$nextTick(() => {
            this.updateAccessibleLabel();
            this.updateFrameCursorInputValue();
        });
        // When a frame is added, we need to make sure it will be visible in the view port. This is particularly true
        // when a paste or duplicate action is performed.
        this.putCaretContainerInView(true);
    },

    unmounted() {
        window.removeEventListener("paste", this.pasteIfFocused);
        document.removeEventListener(CustomEventTypes.scrollCaretIntoView, this.onScrollCaretIntoView);
        // Remove the component's API instance
        if(vueComponentsAPIHandler.caretContainerComponentAPI?.forInstance[this.UID]){
            delete vueComponentsAPIHandler.caretContainerComponentAPI?.forInstance[this.UID];
        }
    },
    
    methods: {
        updateAccessibleLabel() {
            this.accessibleLabel = this.computeAccessibleLabel();
            this.frameCursorDetailsUID = this.getNextFrameInfo().warning.detailsUID;
        },

        getNextFrameInfo() {
            const nextPosition = getNextFrameCaretPosition(
                {id: this.frameId, caretPosition: this.caretAssignedPosition},
                "down"
            );
            const frame = nextPosition
                ? this.appStore.frameObjects[nextPosition.id]
                : undefined;
            return {
                nextPosition,
                frame,
                warning: frame ? this.frameWarning(frame) : {hasWarning: false},
            };
        },

        frameWarning(frame: FrameObject): {hasWarning: boolean; detailsUID?: string} {
            const hasParsingError = Boolean(frame.atParsingError);
            const hasRuntimeError = Boolean(frame.runTimeError);
            const wasLastRuntimeError = this.appStore.wasLastRuntimeErrorFrameId === frame.id;
            if (hasParsingError) {
                return {hasWarning: true, detailsUID: `parsingErrorDescription_frame_${frame.id}`};
            }
            if (hasRuntimeError || wasLastRuntimeError) {
                return {hasWarning: true, detailsUID: `runtimeErrorDescription_frame_${frame.id}`};
            }

            for (const labelIndex of Object.keys(frame.labelSlotsDict).map(Number)) {
                const erroneousSlot = this.appStore.getFlatSlotBases(frame.id, labelIndex)
                    .find((slot) => Boolean(slot.error));
                if (erroneousSlot) {
                    return {
                        hasWarning: true,
                        detailsUID: getLabelSlotErrorDescriptionUID({
                            frameId: frame.id,
                            labelSlotsIndex: labelIndex,
                            slotId: erroneousSlot.id,
                            slotType: erroneousSlot.type,
                        }),
                    };
                }
            }
            return {hasWarning: false};
        },

        playWarningToneForNextFrame() {
            if (!this.settingsStore.sectionChangeSoundEnabled) {
                return;
            }
            const {frame, warning} = this.getNextFrameInfo();
            if (!frame || !warning.hasWarning) {
                return;
            }

            const audioContext = createOrGetAudioContext();
            const toneDuration = 0.1;
            const toneInterval = 0.14;
            [880, 660].forEach((frequency, index) => {
                const oscillator = audioContext.createOscillator();
                const gain = audioContext.createGain();
                const startTime = audioContext.currentTime + index * toneInterval;
                const endTime = startTime + toneDuration;

                oscillator.type = "sine";
                oscillator.frequency.setValueAtTime(frequency, startTime);
                gain.gain.setValueAtTime(0.0001, startTime);
                gain.gain.exponentialRampToValueAtTime(0.035, startTime + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, endTime);
                oscillator.connect(gain);
                gain.connect(audioContext.destination);
                oscillator.onended = () => {
                    oscillator.disconnect();
                    gain.disconnect();
                };
                oscillator.start(startTime);
                oscillator.stop(endTime);
            });
        },

        updateFrameCursorInputValue() {
            const nextPosition = getNextFrameCaretPosition(
                {id: this.frameId, caretPosition: this.caretAssignedPosition},
                "down"
            );
            const frameNumber = nextPosition
                ? this.appStore.getFrameVisualNumbers[nextPosition.id]
                : undefined;
            this.frameCursorNumberLabel = frameNumber === undefined
                ? ""
                : this.$t("accessibility.frameCursorInputHint", {number: frameNumber});
        },

        // Scrolls the frame cursor into view if it's not fully inside the editor's scrolling area. If
        // "delay" is true we wait a bit for the UI to be ready first (needed when a frame has just been
        // added); for plain cursor navigation the caret's element is already in place, and delaying
        // lets fast key repeat (particularly on Safari) move the cursor out of view before we react.
        putCaretContainerInView(delay = false){
            if(this.caretVisibility !== CaretPosition.none && this.caretVisibility === this.caretAssignedPosition) {
                const caretContainerElement = document.getElementById(getCaretContainerUID(this.caretAssignedPosition, this.frameId));
                if (!caretContainerElement) {
                    return;
                }
                const checkAndScroll = () => {
                    // The editor is a scrolling area of its own, below the menu, so test against that
                    // rather than the window (otherwise the cursor can sit hidden above its top edge):
                    const scrollAreaRect = document.getElementById(getEditorMiddleUID())?.getBoundingClientRect();
                    const areaTop = Math.max(0, scrollAreaRect?.top ?? 0);
                    const areaBottom = Math.min(document.documentElement.clientHeight, scrollAreaRect?.bottom ?? Infinity);
                    const rect = caretContainerElement.getBoundingClientRect();
                    if (rect.top < areaTop || rect.bottom > areaBottom) {
                        caretContainerElement.scrollIntoView({block: "nearest"});
                    }
                };
                if (delay) {
                    setTimeout(checkAndScroll, 100);
                }
                else {
                    checkAndScroll();
                }
            }
        },
        
        // Handler for the scrollCaretIntoView event (dispatched when the cursor has moved):
        onScrollCaretIntoView() {
            this.putCaretContainerInView();
        },
        
        // Reset the invisible paste-focus input after stray typing to preserve its silent non-empty value.
        clearFocusInputContent(event: Event) {
            (event.target as HTMLInputElement).value = this.frameCursorInputValue;
        },

        pasteIfFocused(event: ClipboardEvent) {
            // Only respond if we are focused:
            if (this.isFocusedForPaste) {
                // Disable the browser's default paste handler. We handle the paste event below.
                event.preventDefault();
                let pasteDestination = {id: this.frameId, caretPosition: this.caretAssignedPosition};
                const stateBeforeChanges = cloneDeep(this.appStore.$state);
                let hasRemovedFrameSelection = false;
                // If we currently have a selection of frames, the pasted frame should replace the selection, so we delete that selection.
                if(this.appStore.selectedFrames.length > 0){
                    // The key doesn't actually matter here, the method handles it already by doing a backspace deletion.
                    // However, we need to know where was the caret with regards to the selection:
                    // if it was below the selection, it means the deletion will change the current caret
                    // and therefore we need to amend this as a new paste destination (i.e. top of selection).
                    if(this.frameId == this.appStore.selectedFrames.at(-1) as number){
                        const topOfSelectionPos = getAboveFrameCaretPosition(this.appStore.selectedFrames[0]);
                        pasteDestination.id = topOfSelectionPos.frameId;
                        pasteDestination.caretPosition = topOfSelectionPos.caretPosition as CaretPosition;
                    }
                    this.appStore.deleteFrames("backspace", true);
                    hasRemovedFrameSelection = true;
                }

                // #v-ifdef STRYPE_PLATFORM == VITE_STANDARD_PYTHON_MODE
                const inFrameType = this.appStore.frameObjects[(this.appStore.currentFrame.caretPosition == CaretPosition.body) ? this.appStore.currentFrame.id : getParentOrJointParent(this.appStore.currentFrame.id)].frameType;
                if(!inFrameType.forbiddenChildrenTypes.includes(AllFrameTypesIdentifier.funccall) && Object.values(event.clipboardData?.items??[]).some((dataTransferItem: DataTransferItem) => dataTransferItem.kind == "file" && /^(image)|(audio)\//.test(dataTransferItem.type))){
                    // For the special case of image media, we want to simulate the addition of a method call with that media.
                    // Therefore, we will need to "wrap" around the media literal value with our usual wrappers.
                    // We don't rely on the frame authorised children rules for that, because we don't have a copied frame in the state.
                    // We know a media frame cannot be inside an import section, nor directly inside a definition section, nor directly inside a class or function frame
                    // (this test is done first in the condition above).
                    preparePasteMediaData(event, (code: string, dataAndDim: MediaDataAndDim) => {
                        // We create a new function call frame with the media-adapated code content
                        this.appStore.ignoreStateSavingActionsForUndoRedo = true;
                        this.appStore.addFrameWithCommand(getFrameDefType(AllFrameTypesIdentifier.funccall), undefined, true, true).then((frameId) => {
                            this.appStore.setFrameEditableSlotContent(
                                {
                                    frameId: frameId,
                                    labelSlotsIndex: 0,
                                    slotId: "0",
                                    slotType: SlotType.media,
                                    code: code,
                                    mediaType: dataAndDim.itemType,
                                    initCode: "",
                                    isFirstChange: true,
                                }
                            )
                                .then(()=>{
                                    // The slot has not yet been refactored to reflect that it has media in it with multiple slots, and placing the cursor is a bit fragile.
                                    // So what we do is remain at the preceding frame cursor,  then after refactoring, we move right twice (once to go in to the frame, once to go past the image): 
                                    
                                    // Refactor the slots, we call the refactorisation on the LabelSlotsStructure   
                                    // Since that's our last action, we can revert the flag to allow the registration of the state for undo/redo
                                    this.appStore.ignoreStateSavingActionsForUndoRedo = false;                                   
                                    vueComponentsAPIHandler.labelSlotsStructureComponentAPI?.forInstance[getFrameLabelSlotsStructureUID(frameId, 0)]
                                        .checkSlotRefactoring(getLabelSlotUID({frameId: frameId, labelSlotsIndex: 0, slotId: "0", slotType: SlotType.code}), stateBeforeChanges, {doAfterCursorSet: () => {
                                            this.appStore.leftRightKey({key: "ArrowRight"}).then(() => this.appStore.leftRightKey({key: "ArrowRight"}));
                                        }});                                        
                                });
                        });                        
                    });
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    event.stopPropagation();
                    return;
                }
                // #v-endif
                const pythonCode = event.clipboardData?.getData("text");
                // Note we don't permanently trim the code because we need to preserve leading indent.
                // But we trim for the purposes of checking if there's any content at all:
                if (pythonCode != undefined && pythonCode?.trim()) {
                    const res = pasteMixedPython(pythonCode.trimEnd(), pasteDestination, false, false, true);
                    if(res != null){
                        this.appStore.saveStateChanges(stateBeforeChanges);
                    }
                    else if(hasRemovedFrameSelection){
                        // If we had a frame selection, it must be restored as it was since we have already deleted the frames...
                        this.appStore.$state = stateBeforeChanges;
                    }
                }
            }
        },

        handleContextMenuOpened() {
            document.dispatchEvent(new CustomEvent(CustomEventTypes.requestAppNotOnTop, {detail: true}));
        },

        handleContextMenuClosed(){
            this.appStore.isContextMenuKeyboardShortcutUsed=false;
            this.showContextMenu = false;
            document.dispatchEvent(new CustomEvent(CustomEventTypes.requestAppNotOnTop, {detail: false}));
        },

        handleClick (event: MouseEvent, positionForMenu?: Position): void {
            // Do not show any menu if the user's code is being executed
            if(this.isPythonExecuting){
                return;
            }
            
            if(this.appStore.isContextMenuKeyboardShortcutUsed){
                // The logic for handling the context menu opened via a keyboard shortcut is handled by App
                return;
            }

            this.appStore.contextMenuShownId = this.UID;

            this.prepareInsertFrameSubMenu();

            // Overwrite readonly properties clientX and clientY (to position the menu if needed)
            setContextMenuEventClientXY(event, positionForMenu);

            // Create the menu content here and open it
            this.frameContextMenuItems.splice(0);
            this.frameContextMenuItems.push({label: this.$t("contextMenu.paste"), onClick: () => this.paste()}, {divided: "self"});
            this.frameContextMenuItems.push({label: this.$t("contextMenu.insert"), children: this.insertFrameMenuItems});                                    
            this.showContextMenuAtCoordPos.x = event.x;
            this.showContextMenuAtCoordPos.y = event.y;
            this.showContextMenuAtCoordPos.pos = positionForMenu;
            this.showContextMenu = true;
        },

        toggleCaret(): void {
            this.appStore.toggleCaret(
                {id:this.frameId, caretPosition: this.caretAssignedPosition}
            );
        },

        paste(): void {
            // We check upon the context menu informations because a click could be generated on a hovered caret and we can't distinguish 
            // by any other mean which caret is the one the user clicked on.
            const currentShownContextMenuUID: string = this.appStore.contextMenuShownId;
            if(currentShownContextMenuUID === this.UID){
                navigator.clipboard.readText().then((text) => pasteMixedPython(text, {id: this.frameId, caretPosition: this.caretAssignedPosition}));
            }
        },
    
        prepareInsertFrameSubMenu(): void {
            // The list of frames we can insert depends on the current position, therefore, the submenu options are constructed dynamically
            // for that specific position we're at.
            this.insertFrameMenuItems = [];
            const addFrameCommands = this.appStore.generateAvailableFrameCommands(this.appStore.currentFrame.id, this.appStore.currentFrame.caretPosition);
            Object.values(addFrameCommands).forEach((addFrameCmdDef) => {
                this.insertFrameMenuItems.push({label: addFrameCmdDef[0].description, onClick: () => {
                    // This method is called by the submenu and it triggers a click on the AddFrameCommand component,
                    // but we delay it enough so the chain of key events (if applicable) related to the menu terminates,
                    // because otherwise that chain and the key event chain from adding a frame interfer.
                    setTimeout(() => document.getElementById(getAddFrameCmdElementUID(addFrameCmdDef[0].type.type))?.click(), 250);
                }});
            });
        },

        computeAccessibleLabel(): string {
            const currentFrame = this.appStore.frameObjects[this.frameId];
            let navigationPosition = this.caretAssignedPosition;
            if (navigationPosition === CaretPosition.body
                && (currentFrame.frameType.type === AllFrameTypesIdentifier.classdef || currentFrame.frameType.type === AllFrameTypesIdentifier.funcdef)
                && (currentFrame.collapsedState ?? CollapsedState.FULLY_VISIBLE) !== CollapsedState.FULLY_VISIBLE) {
                navigationPosition = CaretPosition.below;
            }

            let structuralNextFrameId: number | undefined;
            if (navigationPosition === CaretPosition.body) {
                structuralNextFrameId = currentFrame.childrenIds.at(0);
            }
            else {
                const parentId = currentFrame.jointParentId > 0 ? currentFrame.jointParentId : currentFrame.parentId;
                const parent = this.appStore.frameObjects[parentId];
                const siblings = currentFrame.jointParentId > 0 ? parent.jointFrameIds : parent.childrenIds;
                const currentSiblingIndex = siblings.indexOf(currentFrame.id);
                structuralNextFrameId = currentSiblingIndex < 0 ? undefined : siblings[currentSiblingIndex + 1];
            }
            const structuralNextFrame = structuralNextFrameId === undefined
                ? undefined
                : this.appStore.frameObjects[structuralNextFrameId];
            const hasPotentialNextFrame = structuralNextFrame !== undefined;
            const nextFramePotentiallyHasBody = structuralNextFrame !== undefined
                && structuralNextFrame.frameType.allowChildren
                && !structuralNextFrame.isDisabled
                && (structuralNextFrame.collapsedState ?? CollapsedState.FULLY_VISIBLE) === CollapsedState.FULLY_VISIBLE;

            const describeFrame = (frameToDescribe: FrameObject): string => {
                const codeDescription = getFrameCodeDescription(
                    frameToDescribe,
                    this.$t("accessibility.media"),
                    this.$t("frame.comment_desc")
                );
                if (codeDescription) {
                    return codeDescription;
                }

                const descriptionKey = `frame.${frameToDescribe.frameType.type}_desc`;
                return this.$te(descriptionKey)
                    ? this.$t(descriptionKey)
                    : this.$t("accessibility.genericFrame");
            };

            let endContainer: FrameObject | undefined;
            if (this.caretAssignedPosition === CaretPosition.below && !hasPotentialNextFrame) {
                const parentId = currentFrame.jointParentId > 0 ? currentFrame.jointParentId : currentFrame.parentId;
                const parent = this.appStore.frameObjects[parentId];
                if (parent && sectionContainerTypes.includes(parent.frameType.type)) {
                    endContainer = parent;
                }
                else if (parent && scopeFrameTypes.includes(parent.frameType.type)) {
                    const description = describeFrame(parent).replace(/\s*:\s*$/, "");
                    return this.$t("accessibility.nextFrameBody", {description});
                }
            }
            else if (this.caretAssignedPosition === CaretPosition.body
                && sectionContainerTypes.includes(currentFrame.frameType.type)
                && currentFrame.childrenIds.length === 0) {
                endContainer = currentFrame;
            }
            if (endContainer) {
                const description = (endContainer.frameType.labels[0]?.label ?? "")
                    .replace(/<[^>]*>/g, " ")
                    .replace(/&nbsp;/g, " ")
                    .replace(/\s+/g, " ")
                    .replace(/\s*:\s*$/, "")
                    .trim();
                return this.$t("accessibility.endOfContainer", {description});
            }

            const nextFrameInfo = this.getNextFrameInfo();
            const nextPosition = nextFrameInfo.nextPosition;
            if (!nextPosition) {
                if (!hasPotentialNextFrame) {
                    return this.$t("accessibility.noNextFrame");
                }
                if (structuralNextFrame?.isDisabled) {
                    return this.$t("accessibility.nextFrameDisabled", {
                        description: this.$t("accessibility.genericFrame"),
                    });
                }
                return nextFramePotentiallyHasBody
                    ? this.$t("accessibility.nextFrameBody", {description: this.$t("accessibility.genericFrame")})
                    : this.$t("accessibility.nextFrame", {description: this.$t("accessibility.genericFrame")});
            }

            const frame = nextFrameInfo.frame;
            if (!frame) {
                return this.$t("accessibility.noNextFrame");
            }

            const frameDescription = nextFrameInfo.warning.hasWarning
                ? this.$t("accessibility.frameWithIssue", {description: describeFrame(frame)})
                : describeFrame(frame);
            const description = frame.isDisabled
                ? this.$t(nextPosition.caretPosition === CaretPosition.body
                    ? "accessibility.nextFrameBodyDisabled"
                    : "accessibility.nextFrameDisabled", {description: frameDescription})
                : nextPosition.caretPosition === CaretPosition.body
                    ? this.$t("accessibility.nextFrameBody", {description: frameDescription})
                    : this.$t("accessibility.nextFrame", {description: frameDescription});

            let ancestorId = getParentOrJointParent(frame.id);
            let scopeDescription = "";
            let isFrozen = frame.frozenState === FrozenState.FROZEN;
            while (ancestorId > 0 && this.appStore.frameObjects[ancestorId]) {
                const ancestor = this.appStore.frameObjects[ancestorId];
                isFrozen = isFrozen || ancestor.frozenState === FrozenState.FROZEN;
                if (!scopeDescription && scopeFrameTypes.includes(ancestor.frameType.type)) {
                    scopeDescription = describeFrame(ancestor);
                }
                ancestorId = getParentOrJointParent(ancestor.id);
            }

            const stateDescriptions: string[] = [];
            if (isFrozen) {
                stateDescriptions.push(this.$t("accessibility.frozen"));
            }
            if ((frame.collapsedState ?? CollapsedState.FULLY_VISIBLE) === CollapsedState.ONLY_HEADER_VISIBLE) {
                stateDescriptions.push(this.$t("accessibility.collapsedToHeader"));
            }
            else if ((frame.collapsedState ?? CollapsedState.FULLY_VISIBLE) === CollapsedState.HEADER_AND_DOC_VISIBLE) {
                stateDescriptions.push(this.$t("accessibility.collapsedWithDescription"));
            }

            const label = [
                description,
                ...(scopeDescription ? [this.$t("accessibility.withinScope", {scope: scopeDescription})] : []),
                ...(stateDescriptions.length ? [this.$t("accessibility.frameState", {states: stateDescriptions.join(", ")})] : []),
            ].join(". ");
            return label;
        },
    },
});
</script>

<style lang="scss">
.#{$strype-classname-caret-container} {
    padding-top: 0px;
    padding-bottom: 0px;
    scroll-margin-top: 50px;
    scroll-margin-bottom: 50px;
    outline: none;
}

// When the paste-focus <input> gets focus, Chromium creates a phantom caret Selection on the input's
// parent element and natively scrolls to reveal it (centring it if need be), a few ms later and even
// with preventScroll. That beats our own small-margin scroll (see putCaretContainerInView) and strands
// the frame cursor mid-screen. If the parent is fixed-position it is always in view, so there's nothing
// to scroll to.
.caret-container-focus-input-wrapper {
    position: fixed;
    top: 0;
    left: 0;
}

.static-caret-container{
    // Put cursor in middle of the reserved gap, and still add height (i.e. use padding not height) to avoid later 
    // sections moving up and down by the caret height as the caret moves in and out of a reserved gap.
    padding-top: calc($caret-height-value/2) + px !important;
    padding-bottom: calc($caret-height-value/2) + px !important;
}

.#{$strype-classname-caret-container}:not(.#{$strype-classname-dragging-frame}):hover{
    cursor: pointer;
}
</style>
