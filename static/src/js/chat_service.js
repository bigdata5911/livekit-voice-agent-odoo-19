/** @odoo-module **/

import { registry } from "@web/core/registry";
import { reactive } from "@odoo/owl";

/**
 * Service to manage chat widget state across the application
 */
export const chatService = reactive({
    isVisible: false,
    isMinimized: false,
    currentAgent: null,
    
    openChat(agent) {
        this.currentAgent = agent;
        this.isVisible = true;
        this.isMinimized = false;
    },
    
    closeChat() {
        this.isVisible = false;
        this.isMinimized = false;
        this.currentAgent = null;
    },
    
    toggleMinimize() {
        this.isMinimized = !this.isMinimized;
    }
});

// Register as a service
registry.category("services").add("chat_service", {
    start() {
        return chatService;
    },
});

