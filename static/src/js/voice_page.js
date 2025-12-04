/** @odoo-module **/

import { Component, useState } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { chatService } from "./chat_service";

export class VoicePage extends Component {
    setup() {
        this.chatService = chatService;
        this.state = useState({
            agents: [
                {
                    id: 'customer_support',
                    name: 'Customer Support',
                    description: 'Get help with customer inquiries and support',
                    icon: 'fa-headset',
                    prompt: 'You are a helpful customer support agent. Assist users with their questions and issues in a friendly and professional manner.'
                },
                {
                    id: 'accounting',
                    name: 'Accounting',
                    description: 'Help with accounting and financial questions',
                    icon: 'fa-calculator',
                    prompt: 'You are an accounting assistant. Help users with financial questions, accounting principles, and bookkeeping tasks.'
                },
                {
                    id: 'general',
                    name: 'General Assistant',
                    description: 'General purpose AI assistant',
                    icon: 'fa-robot',
                    prompt: 'You are a helpful AI assistant. Answer questions and provide assistance on various topics.'
                }
            ]
        });
    }
    
    selectAgent(agent) {
        // Use the chat service to open the chat widget with the selected agent
        this.chatService.openChat(agent);
    }
}

VoicePage.template = "voice_agent.VoicePage";

registry.category("actions").add("voice_page", VoicePage);

