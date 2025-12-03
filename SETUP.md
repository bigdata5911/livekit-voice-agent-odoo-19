# Setup Guide - Odoo LiveKit Voice Chat MVP

## Quick Start

### 1. Install Odoo Module

1. Copy `odoo-plugin` to your Odoo addons directory
2. Update app list: **Apps > Update Apps List**
3. Install **"LiveKit Voice Chat"** module

### 2. Configure LiveKit Credentials

#### Option A: Environment Variables (Recommended)

Set these before starting Odoo:

```bash
export LIVEKIT_URL="ws://localhost:7880"
export LIVEKIT_API_KEY="your_api_key"
export LIVEKIT_API_SECRET="your_api_secret"
```

#### Option B: System Parameters

1. Go to **Settings > Technical > Parameters > System Parameters**
2. Create:
   - `livekit.url` = `ws://localhost:7880`
   - `livekit.api_key` = `your_api_key`
   - `livekit.api_secret` = `your_api_secret`

### 3. Install Python Dependencies (Optional but Recommended)

For token generation, install one of:

```bash
# Option 1: LiveKit SDK (recommended)
pip install livekit

# Option 2: PyJWT (fallback)
pip install PyJWT
```

If neither is installed, the module will show an error when generating tokens.

### 4. Start Voice Agent

See `../livekit-voice-server/README.md` for voice agent setup.

The agent must be running before users can connect.

### 5. Test

1. Go to **Voice Chat** menu
2. Click **"Start Voice Chat"**
3. Allow microphone access
4. Start talking!

## Troubleshooting

### "LiveKit client library not loaded"

- Check browser console for errors
- Ensure CDN is accessible (check network tab)
- Try hard refresh (Ctrl+F5)

### "LiveKit not configured"

- Verify environment variables or system parameters are set
- Restart Odoo after setting environment variables

### "Missing dependencies" error

- Install `livekit` or `PyJWT` Python package
- Restart Odoo

### No audio from agent

- Verify voice agent is running
- Check agent logs for errors
- Ensure agent has correct API keys configured

### Microphone not working

- Check browser permissions
- Ensure HTTPS (required for microphone access in most browsers)
- Try different browser

## Architecture

```
User Browser
    ↓
Odoo Module (/voice/token)
    ↓
LiveKit Server
    ↓
Voice Agent (STT → LLM → TTS)
```

No database, no storage, no complexity!



