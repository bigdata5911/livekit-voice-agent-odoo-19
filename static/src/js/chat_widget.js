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
            });
            
            // Connect to room
            await room.connect(data.url, data.token);
            
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
            
            // Handle connection state changes
            room.on(RoomEvent.Disconnected, () => {
                this.state.isConnected = false;
                this.state.room = null;
                if (this.state.micTrack) {
                    this.state.micTrack.stop();
                }
                this.state.micTrack = null;
            });
            
            room.on(RoomEvent.ParticipantConnected, (participant) => {
                console.log('Participant connected:', participant.identity);
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
        if (this.state.room) {
            this.state.room.disconnect();
            this.state.room = null;
        }
        
        if (this.state.micTrack) {
            this.state.micTrack.stop();
            this.state.micTrack = null;
        }
        
        this.state.isConnected = false;
    }
    
    toggleMinimize() {
        this.chatService.toggleMinimize();
    }
    
    closeChat() {
        // Disconnect if connected
        if (this.state.isConnected) {
            this.disconnect();
        }
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

