/** @odoo-module **/

import { Component, useState, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { rpc } from "@web/core/network/rpc";

// LiveKit client will be loaded from CDN (via manifest assets)
// UMD build exposes as 'LivekitClient'
let Room, RoomEvent, createLocalAudioTrack, Track;

// Function to check if LiveKit is available
function checkLiveKit() {
    // Check the correct global name first (LivekitClient)
    if (window.LivekitClient && window.LivekitClient.Room) {
        return window.LivekitClient;
    }
    // Check other possible names
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
        // Check if already loaded
        if (checkLiveKit()) {
            resolve();
            return;
        }
        
        // Check if script is already being loaded
        if (document.querySelector('script[src*="livekit-client"]')) {
            // Script tag exists, wait for it to load
            let attempts = 0;
            const checkInterval = setInterval(() => {
                attempts++;
                if (checkLiveKit()) {
                    clearInterval(checkInterval);
                    resolve();
                } else if (attempts > 20) { // 10 seconds max
                    clearInterval(checkInterval);
                    reject(new Error('LiveKit script loaded but library not available'));
                }
            }, 500);
            return;
        }
        
        // Create and load script tag
        const script = document.createElement('script');
        script.src = 'https://unpkg.com/livekit-client@latest/dist/livekit-client.umd.js';
        script.async = true;
        script.onload = () => {
            // Wait a bit for the library to initialize
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
    // First, check if already available
    const lk = checkLiveKit();
    if (lk) {
        Room = lk.Room;
        RoomEvent = lk.RoomEvent;
        createLocalAudioTrack = lk.createLocalAudioTrack;
        Track = lk.Track;
        return;
    }
    
    // Try dynamic import (if bundled)
    try {
        const livekit = await import('livekit-client');
        Room = livekit.Room;
        RoomEvent = livekit.RoomEvent;
        createLocalAudioTrack = livekit.createLocalAudioTrack;
        Track = livekit.Track;
        return;
    } catch (e) {
        // Ignore import error, will try script loading
    }
    
    // Wait a bit and check again (CDN might be loading)
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
    
    // If still not loaded, try to load the script dynamically
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

export class VoiceWidget extends Component {
    setup() {
        this.state = useState({
            isConnected: false,
            isConnecting: false,
            error: null,
            room: null,
            micTrack: null,
            livekitLoaded: false,
        });
        
        // Load LiveKit on component mount
        this.loadLiveKitClient();
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
        
        this.state.isConnecting = true;
        this.state.error = null;

        try {
            // Get LiveKit token from Odoo
            const data = await rpc("/voice/token", {});
            
            if (data.error) {
                throw new Error(data.error);
            }

            // Create and connect to LiveKit room
            const room = new Room({
                // Configure room options
                adaptiveStream: true,
                dynacast: true,
            });
            
            // Connect to room
            await room.connect(data.url, data.token);
            
            // Create and publish microphone track
            const micTrack = await createLocalAudioTrack({
                // Microphone options
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            });
            
            await room.localParticipant.publishTrack(micTrack);
            
            // Handle remote audio tracks (agent's voice)
            room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
                if (track.kind === 'audio') {
                    // Create audio element and play agent's audio
                    const audioElement = track.attach();
                    if (audioElement && !audioElement.parentElement) {
                        document.body.appendChild(audioElement);
                    }
                    audioElement.play().catch(e => {
                        console.error('Error playing audio:', e);
                    });
                }
            });
            
            // Also handle tracks that are already subscribed (if any exist)
            if (room.remoteParticipants && typeof room.remoteParticipants.forEach === 'function') {
                room.remoteParticipants.forEach((participant) => {
                    // Use getTrackPublications to get all audio tracks
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
    
    onWillUnmount() {
        // Cleanup on component unmount
        if (this.state.room) {
            this.disconnect();
        }
    }
}

VoiceWidget.template = "odoo_plugin.VoiceWidget";

registry.category("actions").add("voice_widget", VoiceWidget);
