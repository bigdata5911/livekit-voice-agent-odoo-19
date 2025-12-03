# Odoo LiveKit Voice Chat Module (MVP)

Minimal voice chat integration for Odoo 19 with LiveKit. Just voice-in / voice-out with a conversational AI agent.

## Features

- ✅ Simple voice chat interface
- ✅ LiveKit integration
- ✅ AI agent (STT → LLM → TTS)
- ✅ No storage, no transcripts, no actions
- ✅ No database models

## Installation

1. Copy this module to your Odoo addons directory
2. Update the app list in Odoo
3. Install the "LiveKit Voice Chat" module

## Configuration

### Option 1: Environment Variables (Recommended)

Set these environment variables before starting Odoo:

```bash
export LIVEKIT_URL="ws://localhost:7880"
export LIVEKIT_API_KEY="your_api_key"
export LIVEKIT_API_SECRET="your_api_secret"
```

### Option 2: System Parameters

1. Go to **Settings > Technical > Parameters > System Parameters**
2. Create these parameters:
   - `livekit.url` = `ws://localhost:7880`
   - `livekit.api_key` = `your_api_key`
   - `livekit.api_secret` = `your_api_secret`

## Usage

1. Go to **Voice Chat** menu item
2. Click **"Start Voice Chat"** button
3. Allow microphone access when prompted
4. Start talking with the AI agent!

## Architecture

```
┌────────────┐     GET /voice/token     ┌───────────────┐
│   Browser   │ <----------------------> │     Odoo       │
│ (Odoo page) │                          │   Minimal API  │
└──────┬──────┘                          └──────┬────────┘
       │  WebRTC                                   │
       │  join room (token)                        │
       v                                           │
┌────────────┐     media/audio      ┌────────────────────┐
│ LiveKit     │ <------------------>│   Voice Agent Bot   │
│   Server    │     in/out          │ (STT → LLM → TTS)   │
└────────────┘                      └────────────────────┘
```

## API Endpoint

### POST /voice/token

Generates a LiveKit access token for the current user.

**Response:**
```json
{
    "room": "voice_chat",
    "token": "eyJ...",
    "url": "ws://localhost:7880"
}
```

## Requirements

- Odoo 19
- LiveKit server running
- Voice agent worker running (see `livekit-voice-server/`)

## Files Structure

```
odoo-plugin/
├── __init__.py
├── __manifest__.py
├── controllers/
│   ├── __init__.py
│   └── voice_api.py          # Only /voice/token endpoint
├── static/
│   └── src/
│       ├── js/
│       │   └── voice_widget.js
│       └── xml/
│           └── voice_widget.xml
└── views/
    └── menu_items.xml
```

No models, no database, no complexity!
