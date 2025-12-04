/** @odoo-module **/

import { Component, useState, onWillUnmount } from "@odoo/owl";
import { rpc } from "@web/core/network/rpc";
import { registry } from "@web/core/registry";

// LiveKit client will be loaded from CDN (via manifest assets)
let Room, RoomEvent, createLocalAudioTrack, Track;

// Function to check if LiveKit is available
function checkLiveKit() {
    if (window.LivekitClient && window.LivekitClient.Room) {
        return window.LivekitClient;
    }
    const possibleGlobals = [
        window.livekitClient,
        window.livekit,
        window.LiveKit,
    ];
    
    for (const lk of possibleGlobals) {
        if (lk && lk.Room) {
            return lk;
        }
    }
    return null;
}

// Function to load LiveKit script dynamically
function loadLiveKitScript() {
    return new Promise((resolve, reject) => {
        if (checkLiveKit()) {
            resolve();
            return;
        }
        
        if (document.querySelector('script[src*="livekit-client"]')) {
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                if (checkLiveKit()) {
                    clearInterval(checkInterval);
                    resolve();
                } else if (attempts > 20) {
                    clearInterval(checkInterval);
                    reject(new Error('LiveKit script loaded but library not available'));
                }
            }, 500);
            return;
        }
        
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/livekit-client@latest/dist/livekit-client.umd.js';
        script.async = true;
        script.onload = () => {
            setTimeout(() => {
                if (checkLiveKit()) {
                    resolve();
                } else {
                    reject(new Error('LiveKit script loaded but library not available'));
                }
            }, 100);
        };
        script.onerror = () => {
            reject(new Error('Failed to load LiveKit script from CDN'));
        };
        document.head.appendChild(script);
    });
}

// Try to load LiveKit client
async function loadLiveKit() {
    const lk = checkLiveKit();
    if (lk) {
        Room = lk.Room;
        RoomEvent = lk.RoomEvent;
        createLocalAudioTrack = lk.createLocalAudioTrack;
        Track = lk.Track;
        return;
    }
    
    try {
        const livekit = await import('livekit-client');
        Room = livekit.Room;
        RoomEvent = livekit.RoomEvent;
        createLocalAudioTrack = livekit.createLocalAudioTrack;
        Track = livekit.Track;
        return;
    } catch (e) {
        // Ignore import error
    }
    
    for (let i = 0; i < 10; i++) {
        await new Promise(resolve => setTimeout(resolve, 200));
        const lk = checkLiveKit();
        if (lk) {
            Room = lk.Room;
            RoomEvent = lk.RoomEvent;
            createLocalAudioTrack = lk.createLocalAudioTrack;
            Track = lk.Track;
            return;
        }
    }
    
    try {
        await loadLiveKitScript();
        const lk = checkLiveKit();
        if (lk) {
            Room = lk.Room;
            RoomEvent = lk.RoomEvent;
            createLocalAudioTrack = lk.createLocalAudioTrack;
            Track = lk.Track;
            return;
        }
    } catch (e) {
        console.error('Failed to load LiveKit script:', e);
    }
    
    throw new Error('LiveKit client library not loaded. Please ensure livekit-client is included in assets or check your network connection.');
}

export class ChatWidget extends Component {
    setup() {
        // Get service from env
        this.chatService = this.env.services.chat_service;
        this.state = useState({
            isConnected: false,
            isConnecting: false,
            error: null,
            room: null,
            micTrack: null,
            livekitLoaded: false,
            messages: [], // Array of {sender: 'user'|'agent', text: string, timestamp: Date, streaming?: boolean, messageId?: string, isTranscript?: boolean}
            messageInput: '', // Current text input
            isAgentSpeaking: false, // Indicator for agent voice activity
            isUserSpeaking: false, // Indicator for user voice activity
            currentStreamingMessage: null, // Current streaming message from agent
        });
        
        // Make chatService reactive by observing it
        this.chatServiceState = useState(this.chatService);
        
        // Load LiveKit on component mount
        this.loadLiveKitClient();
    }
    
    get isVisible() {
        return this.chatServiceState.isVisible;
    }
    
    get isMinimized() {
        return this.chatServiceState.isMinimized;
    }
    
    get agentName() {
        return this.chatServiceState.currentAgent?.name || 'Voice Agent';
    }
    
    get agentId() {
        return this.chatServiceState.currentAgent?.id || null;
    }
    
    async loadLiveKitClient() {
        try {
            await loadLiveKit();
            this.state.livekitLoaded = true;
        } catch (error) {
            this.state.error = 'Failed to load LiveKit client. Please ensure livekit-client is included.';
            console.error('LiveKit load error:', error);
        }
    }
    
    async connectToVoice() {
        if (!this.state.livekitLoaded) {
            this.state.error = 'LiveKit client not loaded yet. Please wait...';
            return;
        }
        
        if (!this.agentId) {
            this.state.error = 'No agent selected';
            return;
        }
        
        this.state.isConnecting = true;
        this.state.error = null;

        try {
            // Get LiveKit token from Odoo with agent ID
            const data = await rpc("/voice/token", {
                agent_id: this.agentId,
            });
            
            if (data.error) {
                throw new Error(data.error);
            }

            // Create and connect to LiveKit room
            const room = new Room({
                adaptiveStream: true,
                dynacast: true,
                // Keep connection alive
                disconnectOnPageLeave: false,
            });
            
            // Connect to room
            await room.connect(data.url, data.token);
            
            // Log connection success
            console.log('Connected to LiveKit room:', data.room);
            
            // Create and publish microphone track
            const micTrack = await createLocalAudioTrack({
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            });
            
            await room.localParticipant.publishTrack(micTrack);
            
            // Handle remote audio tracks (agent's voice)
            room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
                if (track.kind === 'audio') {
                    const audioElement = track.attach();
                    if (audioElement && !audioElement.parentElement) {
                        document.body.appendChild(audioElement);
                    }
                    audioElement.play().catch(e => {
                        console.error('Error playing audio:', e);
                    });
                }
            });
            
            // Handle tracks that are already subscribed
            if (room.remoteParticipants && typeof room.remoteParticipants.forEach === 'function') {
                room.remoteParticipants.forEach((participant) => {
                    const audioTracks = participant.getTrackPublications().filter(
                        pub => pub.kind === 'audio' && pub.isSubscribed
                    );
                    
                    audioTracks.forEach((trackPublication) => {
                        if (trackPublication.track) {
                            const audioElement = trackPublication.track.attach();
                            if (audioElement && !audioElement.parentElement) {
                                document.body.appendChild(audioElement);
                            }
                            audioElement.play().catch(e => {
                                console.error('Error playing audio:', e);
                            });
                        }
                    });
                });
            }
            
            // Handle LiveKit native chat messages (for text chat)
            room.on(RoomEvent.ChatMessage, (message, participant) => {
                try {
                    // Determine if message is from self or agent
                    const isSelf = participant && participant.identity === room.localParticipant.identity;
                    // If participant is undefined or not self, it's from the agent
                    // This handles cases where participant might be undefined for agent messages
                    const isAgent = !isSelf;
                    
                    console.log('📨 Received ChatMessage:', message.message, 'from:', isSelf ? 'self' : 'agent', 
                                'participant:', participant?.identity || 'undefined');
                    
                    // Check if this message already exists (to prevent duplicates from optimistic update)
                    const messageId = message.id || message.message;
                    const messageExists = this.state.messages.some(
                        msg => (msg.messageId === messageId) || 
                               (msg.text === message.message && 
                                Math.abs(new Date(msg.timestamp).getTime() - message.timestamp) < 2000)
                    );
                    
                    // Only add if it doesn't already exist
                    if (!messageExists) {
                        this.state.messages.push({
                            sender: isSelf ? 'user' : 'agent',
                            text: message.message,
                            timestamp: new Date(message.timestamp),
                            messageId: messageId, // Store ID to prevent duplicates
                        });
                    } else {
                        console.log('⚠️ Skipping duplicate message:', message.message);
                    }
                } catch (e) {
                    console.error('Error handling chat message:', e);
                }
            });
            
            // Handle transcription events (for voice chat)
            // This is CRITICAL for voice messages to appear in chat history
            // TranscriptionReceived event: (segments: TranscriptionSegment[], participant?: Participant, publication?: TrackPublication)
            room.on(RoomEvent.TranscriptionReceived, (segments, participant, publication) => {
                try {
                    if (!segments || segments.length === 0) return;
                    
                    // Get the participant identity
                    const participantIdentity = participant ? participant.identity : null;
                    const isAgent = participantIdentity && participantIdentity !== room.localParticipant.identity;
                    const isSelf = participantIdentity === room.localParticipant.identity;
                    
                    // Process each transcription segment
                    segments.forEach((segment) => {
                        // Only process final segments to avoid duplicates
                        if (segment.final && segment.text && segment.text.trim()) {
                            console.log('🎤 Received Transcription:', segment.text, 'from:', isSelf ? 'self' : 'agent');
                            
                            // Add transcription to chat history
                            this.state.messages.push({
                                sender: isSelf ? 'user' : 'agent',
                                text: segment.text.trim(),
                                timestamp: new Date(segment.startTime || Date.now()),
                                isTranscript: true,
                            });
                        }
                    });
                } catch (e) {
                    console.error('Error handling transcription:', e);
                }
            });
            
            // Handle data channel messages for transcripts and other custom data (fallback)
            room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => {
                if (kind === 1) { // Reliable data channel
                    try {
                        const data = JSON.parse(new TextDecoder().decode(payload));
                        
                        if (data.type === 'transcript' && data.text) {
                            // Voice transcript from user or agent
                            this.state.messages.push({
                                sender: data.sender || 'user',
                                text: data.text,
                                timestamp: new Date(),
                                isTranscript: true,
                            });
                        } else if (data.type === 'chat' && data.message) {
                            // Legacy text message support (for streaming)
                            if (data.streaming) {
                                // Streaming response - update current message
                                if (this.state.currentStreamingMessage) {
                                    this.state.currentStreamingMessage.text = data.message;
                                } else {
                                    this.state.currentStreamingMessage = {
                                        sender: 'agent',
                                        text: data.message,
                                        timestamp: new Date(),
                                        streaming: true,
                                    };
                                    this.state.messages.push(this.state.currentStreamingMessage);
                                }
                            } else {
                                // Complete message
                                if (this.state.currentStreamingMessage) {
                                    this.state.currentStreamingMessage.streaming = false;
                                    this.state.currentStreamingMessage = null;
                                } else {
                                    this.state.messages.push({
                                        sender: 'agent',
                                        text: data.message,
                                        timestamp: new Date(),
                                    });
                                }
                            }
                        } else if (data.type === 'agent_speaking') {
                            // Agent voice activity indicator
                            this.state.isAgentSpeaking = data.speaking || false;
                        } else if (data.type === 'user_speaking') {
                            // User voice activity indicator
                            this.state.isUserSpeaking = data.speaking || false;
                        }
                    } catch (e) {
                        console.error('Error parsing data message:', e);
                    }
                }
            });
            
            // Handle connection state changes
            room.on(RoomEvent.Disconnected, (reason) => {
                console.log('Room disconnected, reason:', reason);
                this.state.isConnected = false;
                this.state.room = null;
                if (this.state.micTrack) {
                    this.state.micTrack.stop();
                }
                this.state.micTrack = null;
                // Add disconnect message
                this.state.messages.push({
                    sender: 'system',
                    text: 'Disconnected from agent',
                    timestamp: new Date(),
                });
            });
            
            room.on(RoomEvent.Connected, () => {
                console.log('Room connected successfully');
            });
            
            room.on(RoomEvent.Reconnecting, () => {
                console.log('Reconnecting to room...');
            });
            
            room.on(RoomEvent.Reconnected, () => {
                console.log('Reconnected to room');
            });
            
            room.on(RoomEvent.ParticipantConnected, (participant) => {
                console.log('Participant connected:', participant.identity);
                // Add welcome message
                this.state.messages.push({
                    sender: 'system',
                    text: `Connected to ${this.agentName}`,
                    timestamp: new Date(),
                });
            });
            
            room.on(RoomEvent.ParticipantDisconnected, (participant) => {
                console.log('Participant disconnected:', participant.identity);
            });
            
            // Handle errors
            room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
                console.log('Connection quality:', quality, participant?.identity);
            });
            
            room.on(RoomEvent.TrackPublished, (publication, participant) => {
                console.log('Track published:', publication.kind, participant?.identity);
            });
            
            room.on(RoomEvent.TrackUnpublished, (publication, participant) => {
                console.log('Track unpublished:', publication.kind, participant?.identity);
            });
            
            // Update state
            this.state.room = room;
            this.state.micTrack = micTrack;
            this.state.isConnected = true;
            this.state.isConnecting = false;
            
        } catch (error) {
            this.state.error = error.message || 'Failed to connect to voice chat';
            this.state.isConnecting = false;
            console.error("Voice connection error:", error);
        }
    }
    
    async disconnect() {
        try {
            // Stop microphone first
            if (this.state.micTrack) {
                this.state.micTrack.stop();
                this.state.micTrack = null;
            }
            
            // Then disconnect from room
            if (this.state.room) {
                await this.state.room.disconnect();
                this.state.room = null;
            }
            
            this.state.isConnected = false;
            
            // Add disconnect message
            this.state.messages.push({
                sender: 'system',
                text: 'Disconnected',
                timestamp: new Date(),
            });
        } catch (error) {
            console.error('Error during disconnect:', error);
            this.state.isConnected = false;
        }
    }
    
    async sendTextMessage() {
        if (!this.state.messageInput.trim() || !this.state.room || !this.state.isConnected) {
            return;
        }
        
        const message = this.state.messageInput.trim();
        
        // Send message using LiveKit's native chat API
        // IMPORTANT: Use sendText() with topic 'lk.chat' (same as agents-playground and demo.ts)
        // This is the correct way to send chat messages that the server will process
        try {
            console.log('📤 Sending text message:', message);
            
            // Use sendText with topic 'lk.chat' - this is what setupChat uses internally
            // This sends a text stream that the server receives via data_received or text stream handler
            const streamInfo = await this.state.room.localParticipant.sendText(message, { 
                topic: 'lk.chat' 
            });
            
            // Add optimistic update with the stream info ID
            // The ChatMessage event will fire when server processes it, and we'll skip the duplicate
            this.state.messages.push({
                sender: 'user',
                text: message,
                timestamp: new Date(),
                messageId: streamInfo?.id || `temp-${Date.now()}`, // Use stream info ID if available
            });
            
            // Clear input
            this.state.messageInput = '';
        } catch (error) {
            console.error('❌ Error sending message:', error);
            this.state.error = 'Failed to send message: ' + error.message;
        }
    }
    
    onMessageInputKeydown(ev) {
        if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            this.sendTextMessage();
        }
    }
    
    toggleMinimize() {
        this.chatService.toggleMinimize();
    }
    
    closeChat() {
        // Disconnect if connected
        if (this.state.isConnected) {
            this.disconnect();
        }
        
        // Clear chat history when closing the widget
        this.state.messages = [];
        this.state.currentStreamingMessage = null;
        this.state.messageInput = '';
        this.state.error = null;
        
        this.chatService.closeChat();
    }
    
    onWillUnmount() {
        // Cleanup on component unmount
        if (this.state.room) {
            this.disconnect();
        }
    }
}

ChatWidget.template = "voice_agent.ChatWidget";

// Register as a main component - Odoo will handle template loading and mounting
// This ensures templates are available when the component is rendered
registry.category("main_components").add("ChatWidget", {
    Component: ChatWidget,
});

