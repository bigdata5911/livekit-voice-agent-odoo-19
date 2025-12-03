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
    'author': 'Your Company',
    'website': 'https://www.yourcompany.com',
    'depends': ['base', 'web'],
    'data': [
        'views/menu_items.xml',
    ],
    'assets': {
        'web.assets_backend': [
            ('include', 'https://unpkg.com/livekit-client@latest/dist/livekit-client.umd.js'),
            'odoo_plugin/static/src/js/voice_widget.js',
            'odoo_plugin/static/src/xml/voice_widget.xml',
        ],
    },
    'installable': True,
    'application': False,
    'auto_install': False,
    'license': 'LGPL-3',
}

