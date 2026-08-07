<template>
    <BModal
        v-if="showModal"
        :visible="showModal"
        hide-footer
        size="xl"
        @close="close()"
    >
        <img
            class="w-100" 
            :src="image"
        />
    </BModal>
    <div
        v-else 
        :class="scssVars.messageBannerContainerClassName"
    >
        <span v-if="message.message">{{ (typeof message.message !== "string")? $t(message.message.path, message.message.args) : $t(message.message) }}</span>
        <span :class="scssVars.messageBannerCrossClassName" v-on:click="close">&#x2716;</span>        
        <br/>
        <button 
            v-for="(button,index) in message.buttons"
            :key="'messageButton-'+index"
            v-on:click="onButtonClick(button.action)"
        > {{ $t(button.label) }} (F{{index+1}})
        </button>
    </div>
</template>

<script lang="ts">
import { defineComponent } from "vue";
import { useStore } from "@/store/store";
import { MessageDefinedActions, MessageDefinition, MessageDefinitions, MessageTypes, VoidFunction } from "@/types/types";
import { mapStores } from "pinia";
import scssVars from "@/assets/style/_export.module.scss";
import { BModal } from "bootstrap-vue-next";
import { markUserDecisionOnReloading } from "@/store/store-db-storage";

export default defineComponent({
    name: "MessageBanner",

    components:{
        BModal,
    },

    data: function() {
        return {
            scssVars, // just to be able to use in template
            image: "" as string,
        };
    },

    created() {
        // Vite needs to bundle the image at build time, the following code allows Vite to bundle all the images
        this.image = (this.message.path.length > 0) ? new URL(`../assets/images/${this.message.path}`, import.meta.url).href : "";
    },
    
    mounted() {
        window.addEventListener("keydown",this.onKeyDown);
    },

    beforeUnmount() {
        window.removeEventListener("keydown",this.onKeyDown);
    },

    //Updated is needed in case one message pops and before its gone another is shown
    updated() {
        // Vite needs to bundle the image at build time, the following code allows Vite to bundle all the images
        this.image = (this.message.path.length > 0) ? new URL(`../assets/images/${this.message.path}`, import.meta.url).href : "";
    },

    computed: {
        ...mapStores(useStore),
        
        message(): MessageDefinition {
            return this.appStore.currentMessage;
        },

        showModal(): boolean{
            return this.message.type === MessageTypes.imageDisplay;
        },
    },

    methods: {
        close(): void {
            // Dismissing the banner (via the cross icon) counts as a decision, same as clicking Cancel below --
            // otherwise a new tab opened shortly after would be nagged again with the same recent-state offer.
            if (this.appStore.foundRecentState != null) {
                void markUserDecisionOnReloading([this.appStore.foundRecentState.tabId]);
                this.appStore.foundRecentState = null;
            }
            this.appStore.currentMessage = MessageDefinitions.NoMessage;
        },

        onKeyDown(e: KeyboardEvent) : void {
            // Only look for F1, F2 etc:

            const match = e.code.match(/^F(\d{1,2})$/);
            if (match) {
                const buttonIndex = Number(match[1]) - 1;
                if (buttonIndex < this.message.buttons.length) {
                    this.onButtonClick(this.message.buttons[buttonIndex].action);
                }
                e.preventDefault();
                e.stopPropagation();
            }
        },

        onButtonClick(payload: VoidFunction | string){
            // If the type of the action associated with this button is a function
            // we run this function. If the type is string then we run a predefined action. 
            if((typeof payload) === "function"){
                (payload as VoidFunction)();
            }
            else{
                switch(payload){
                case MessageDefinedActions.closeBanner:
                    // Declining (Cancel) counts as a decision too -- see close() above for why.
                    if (this.appStore.foundRecentState != null) {
                        void markUserDecisionOnReloading([this.appStore.foundRecentState.tabId]);
                        this.appStore.foundRecentState = null;
                    }
                    this.appStore.currentMessage = MessageDefinitions.NoMessage;
                    break;
                case MessageDefinedActions.undo:
                    this.appStore.applyStateUndoRedoChanges(true);
                    this.appStore.currentMessage = MessageDefinitions.NoMessage;
                    break;
                case MessageDefinedActions.reload:
                    window.location.reload();
                    break;
                case MessageDefinedActions.load:
                    if (this.appStore.foundRecentState != null) {
                        // Set both these items going in parallel (first is quick, second is longer and we don't need to wait for it):
                        void markUserDecisionOnReloading([this.appStore.foundRecentState.tabId]);
                        void this.appStore.setStateFromJSONStr({stateJSONStr: this.appStore.foundRecentState.data, readCompressed: true});
                        this.appStore.foundRecentState = null;
                    }
                    break;
                default:
                    break;
                }
            }
        },
    },
});
</script>

<style lang="scss">
.#{$strype-classname-message-banner-container} {
    display: inline-block;
    width: 100%;
    background-color: #BBBBBB;
    padding:5px;
    button {
        margin-left: 3em;
    }
}

.#{$strype-classname-message-banner-cross} {
    float: right;
    margin-right:15px;
    cursor:pointer;
}
</style>
