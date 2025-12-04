{
    'name': 'LiveKit Voice Chat',
    'version': '19.0.1.0.0',
    'category': 'Tools',
    'summary': 'Minimal voice chat with LiveKit AI agent',
    'description': """
        LiveKit Voice Chat Module (MVP)
        ===============================
        
        Minimal voice chat integration with LiveKit.
        Just voice-in / voice-out with a conversational AI agent.
        
        Features:
        * Simple voice chat interface
        * LiveKit integration
        * AI agent (STT → LLM → TTS)
        * No storage, no transcripts, no actions
    """,
    'author': 'CycleSyncAI',
    'website': 'https://cyclesyncai.com',
    'depends': ['base', 'web'],
    'data': [
        'views/menu_items.xml',
    ],
    'assets': {
        'web.assets_backend': [
            ('include', 'https://unpkg.com/livekit-client@latest/dist/livekit-client.umd.js'),
            # Load XML templates first so they're available when JS components load
            'voice_agent/static/src/xml/voice_page.xml',
            'voice_agent/static/src/xml/chat_widget.xml',
            # Then load JS files
            'voice_agent/static/src/js/chat_service.js',
            'voice_agent/static/src/js/voice_page.js',
            'voice_agent/static/src/js/chat_widget.js',
            # Finally load CSS
            'voice_agent/static/src/css/voice_agent.css',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}

