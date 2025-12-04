"""
Minimal Voice API Controller
Only provides /voice/token endpoint for LiveKit access
"""
from odoo import http
from odoo.http import request
import logging
import os

_logger = logging.getLogger(__name__)

# Import LiveKit SDK
try:
    from livekit import api
    HAS_LIVEKIT_SDK = True
except ImportError as e:
    HAS_LIVEKIT_SDK = False
    import logging
    _import_logger = logging.getLogger(__name__)
    _import_logger.warning(f"LiveKit SDK import failed: {str(e)}. Please ensure livekit is installed in the Odoo Python environment.")


class VoiceController(http.Controller):
    """Minimal voice controller - only token generation"""
    
    @http.route('/voice/token', type='json', auth='user', methods=['POST'])
    def get_token(self, agent_id=None):
        """
        Generate LiveKit access token for user
        Args:
            agent_id: ID of the voice agent (e.g., 'customer_support', 'accounting')
        Returns: {room, token, url, agent_id, prompt}
        """
        try:
            # Get LiveKit credentials from environment or system parameters
            # For MVP, we'll use environment variables or system parameters
            livekit_url = os.getenv('LIVEKIT_URL') or request.env['ir.config_parameter'].sudo().get_param('livekit.url', '')
            livekit_api_key = os.getenv('LIVEKIT_API_KEY') or request.env['ir.config_parameter'].sudo().get_param('livekit.api_key', '')
            livekit_api_secret = os.getenv('LIVEKIT_API_SECRET') or request.env['ir.config_parameter'].sudo().get_param('livekit.api_secret', '')
            
            if not all([livekit_url, livekit_api_key, livekit_api_secret]):
                return {
                    'error': 'LiveKit not configured. Please set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET environment variables or system parameters.'
                }
            
            # Define agent prompts
            agent_prompts = {
                'customer_support': 'You are a helpful customer support agent. Assist users with their questions and issues in a friendly and professional manner.',
                'accounting': 'You are an accounting assistant. Help users with financial questions, accounting principles, and bookkeeping tasks.',
                'general': 'You are a helpful AI assistant. Answer questions and provide assistance on various topics.',
            }
            
            # Default to general if agent_id not provided or invalid
            if not agent_id or agent_id not in agent_prompts:
                agent_id = 'general'
            
            # Generate room name based on agent (per-agent rooms)
            room_name = f"voice_chat_{agent_id}"
            
            # Get user identity - ensure it's never empty
            user = request.env.user
            identity = user.login or user.name or f"user_{user.id}" or "anonymous"
            
            # Ensure identity is a non-empty string and sanitize it
            if not identity or not identity.strip():
                identity = f"user_{user.id}" if user.id else "anonymous"
            
            # Sanitize identity: remove spaces and special characters that might cause issues
            # LiveKit requires identity to be alphanumeric with underscores/hyphens
            identity = identity.strip().replace(' ', '_').replace('@', '_at_')
            # Remove any other special characters except underscore, hyphen, and dot
            import re
            identity = re.sub(r'[^a-zA-Z0-9_\-.]', '', identity)
            
            # Final validation - ensure identity is not empty after sanitization
            if not identity or len(identity) == 0:
                identity = f"user_{user.id}" if user.id else "anonymous"
            
            # Log for debugging
            _logger.info(f"Generating LiveKit token for user: {user.id} (login: {user.login}), identity: {identity}")
            
            # Generate LiveKit access token using the SDK (following generate_room_token.py pattern)
            # Try to import livekit at runtime (in case it was installed after module load)
            try:
                from livekit import api
            except ImportError as import_error:
                error_msg = f'LiveKit SDK not available. Import error: {str(import_error)}. Please ensure livekit is installed in the Odoo Python environment: pip install livekit --break-system-packages'
                _logger.error(error_msg)
                return {'error': error_msg}
            
            # Generate token using method chaining (same pattern as sample)
            # Added can_publish and can_subscribe for voice chat functionality
            token = api.AccessToken(livekit_api_key, livekit_api_secret) \
                .with_identity(identity) \
                .with_grants(api.VideoGrants(
                    room_join=True,
                    can_publish=True,
                    can_subscribe=True,
                    room=room_name
                )) \
                .to_jwt()
            
            _logger.info(f"Token generated successfully using LiveKit SDK for identity: {identity}, agent: {agent_id}")
            
            return {
                'room': room_name,
                'token': token,
                'url': livekit_url.rstrip('/'),
                'agent_id': agent_id,
                'prompt': agent_prompts[agent_id]
            }
            
        except Exception as e:
            _logger.error(f"Error generating LiveKit token: {str(e)}", exc_info=True)
            return {'error': str(e)}
