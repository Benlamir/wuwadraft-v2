# backend/defaultHandler/app.py

import json
import boto3
import logging
import os
import uuid # Import uuid library for generating unique IDs
from datetime import datetime, timezone, timedelta # For timestamps and timedelta
from boto3.dynamodb.conditions import Key, Attr # Keep this if needed elsewhere
from botocore.exceptions import ClientError # Remove ConditionalCheckFailedException from import
import time
import random  # Added for random selection on timeout
import decimal

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- Helper Function (Decimal Encoder) ---
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            # Check if it's an integer stored as Decimal
            if obj % 1 == 0:
                return int(obj)
            else:
                # Keep precision for floats stored as Decimal
                # Using str() preserves precision accurately
                return float(obj)
        # Let the base class default method raise the TypeError
        return json.JSONEncoder.default(self, obj)
# --- END Helper Function ---

# --- ADD HELPER FUNCTION FOR TURN LOGIC ---
def resolve_turn_from_role(turn_designation, player_roles):
    """Resolves the actual player turn (P1/P2) from a role designation and player role mapping.
    
    Args:
        turn_designation (str): The role from the draft template (P1_ROLE, P2_ROLE, ROLE_A, or ROLE_B)
        player_roles (dict): Mapping of template roles to actual players
        
    Returns:
        str: The resolved player (P1 or P2) or None if resolution fails
    """
    logger.info(f"Resolving turn from designation '{turn_designation}' using roles {player_roles}")
    
    # Handle P1_FAVORED_DRAFT_ORDER roles
    if 'P1_ROLE_IN_TEMPLATE' in player_roles:
        if turn_designation == 'P1_ROLE':
            return player_roles.get('P1_ROLE_IN_TEMPLATE')
        elif turn_designation == 'P2_ROLE':
            return player_roles.get('P2_ROLE_IN_TEMPLATE')
    
    # Handle NEUTRAL_DRAFT_ORDER_TEMPLATE_V2 roles
    elif 'ROLE_A' in player_roles:
        if turn_designation == 'ROLE_A':
            return player_roles.get('ROLE_A')
        elif turn_designation == 'ROLE_B':
            return player_roles.get('ROLE_B')
    
    logger.error(f"Could not resolve turn. Designation: {turn_designation}, Roles: {player_roles}")
    return None

def determine_next_state(current_step_index, effective_draft_order_list_of_dicts):
    """Calculates the next phase, turn designation, and index based on the current step index."""
    next_index = current_step_index + 1
    if next_index < len(effective_draft_order_list_of_dicts):
        step_info = effective_draft_order_list_of_dicts[next_index]
        next_phase = step_info['phase']
        next_turn_designation = step_info['turnPlayerDesignation'] # This is 'P1_ROLE', 'ROLE_A', etc.
        logger.info(f"Draft progression: From index {current_step_index} -> To index {next_index} ({next_phase}, {next_turn_designation})")
        return next_phase, next_turn_designation, next_index
    else:
        # Reached the end of the defined order
        logger.info(f"Draft progression: Reached end of draft order (index {current_step_index}). Setting state to COMPLETE.")
        # Return completion state and an index marker (e.g., -1 or None)
        return DRAFT_COMPLETE_PHASE, None, -1 # Indicate completion with index -1 (or None)
# --- END HELPER FUNCTION ---

# List of all draftable resonators
ALL_RESONATOR_NAMES = sorted([
    'Jiyan',
    'Lingyang',
    'Rover',
    'Yangyang',
    'Chixia',
    'Baizhi',
    'Sanhua',
    'Yuanwu',
    'Aalto',
    'Danjin',
    'Mortefi',
    'Taoqi',
    'Calcharo',
    'Encore',
    'Jianxin',
    'Verina',
    'Yinlin',
    'Jinhsi',
    'Changli',
    'Zhezhi',
    'Xiangli Yao',
    'The Shorekeeper',
    'Youhu',
    'Camellya',
    'Lumi',
    'Carlotta',
    'Roccia',
    'Brant',
    'Cantarella',
    'Phoebe',
    'Zani',
    'Ciaconna'
])

# --- Equilibration System Constants ---
# Weighted points for sequences S0-S6
SEQUENCE_POINTS = {
    0: 2,  # S0
    1: 4,  # S1
    2: 8,  # S2
    3: 10, # S3
    4: 11, # S4
    5: 12, # S5
    6: 16  # S6
}

# Thresholds for different equilibration actions
SCORE_DIFF_THRESHOLD_MINOR_P1_PRIORITY = 6
SCORE_DIFF_THRESHOLD_MAJOR_ONE_EQ_BAN = 12
SCORE_DIFF_THRESHOLD_EXTREME_TWO_EQ_BANS = 24

# --- Define the Draft Order ---
# Structure: (Phase Name, Player Turn)
DRAFT_ORDER = [
    ('BAN1', 'P1'),    # Step 0
    ('BAN1', 'P2'),    # Step 1
    ('PICK1', 'P1'),   # Step 2
    ('PICK1', 'P2'),   # Step 3
    ('PICK1', 'P1'),   # Step 4 
    ('PICK1', 'P2'),   # Step 5 
    ('BAN2', 'P1'),    # Step 6
    ('BAN2', 'P2'),    # Step 7
    ('PICK2', 'P2'),   # Step 8
    ('PICK2', 'P1'),   # Step 9
    # Add more steps if needed (e.g., for BAN3/PICK3 if structure changes)
]

# Draft Order Templates
P1_FAVORED_DRAFT_ORDER = [
    {'phase': 'BAN1', 'turnPlayerDesignation': 'P1_ROLE'},
    {'phase': 'BAN1', 'turnPlayerDesignation': 'P2_ROLE'},
    {'phase': 'PICK1', 'turnPlayerDesignation': 'P1_ROLE'},
    {'phase': 'PICK1', 'turnPlayerDesignation': 'P2_ROLE'},
    {'phase': 'PICK1', 'turnPlayerDesignation': 'P1_ROLE'},
    {'phase': 'PICK1', 'turnPlayerDesignation': 'P2_ROLE'},
    {'phase': 'BAN2', 'turnPlayerDesignation': 'P1_ROLE'},
    {'phase': 'BAN2', 'turnPlayerDesignation': 'P2_ROLE'},
    {'phase': 'PICK2', 'turnPlayerDesignation': 'P2_ROLE'},
    {'phase': 'PICK2', 'turnPlayerDesignation': 'P1_ROLE'}
]

NEUTRAL_DRAFT_ORDER_TEMPLATE_V2 = [
    {'phase': 'BAN1', 'turnPlayerDesignation': 'ROLE_A'},
    {'phase': 'BAN1', 'turnPlayerDesignation': 'ROLE_B'},
    {'phase': 'PICK1', 'turnPlayerDesignation': 'ROLE_B'},
    {'phase': 'PICK1', 'turnPlayerDesignation': 'ROLE_A'},
    {'phase': 'PICK1', 'turnPlayerDesignation': 'ROLE_A'},
    {'phase': 'PICK1', 'turnPlayerDesignation': 'ROLE_B'},
    {'phase': 'BAN2', 'turnPlayerDesignation': 'ROLE_B'},
    {'phase': 'BAN2', 'turnPlayerDesignation': 'ROLE_A'},
    {'phase': 'PICK2', 'turnPlayerDesignation': 'ROLE_A'},
    {'phase': 'PICK2', 'turnPlayerDesignation': 'ROLE_B'}
]

EQUILIBRATION_PHASE_NAME = 'EQUILIBRATE_BANS'
EQUILIBRATION_PHASE_TIMEOUT_SECONDS = 300 # 5 minutes

PRE_DRAFT_READY_STATE = 'PRE_DRAFT_READY'

DRAFT_COMPLETE_PHASE = 'DRAFT_COMPLETE' # Constant for completed state
# --- End Draft Order Definition ---

# --- Configuration ---
CONNECTIONS_TABLE_NAME = os.environ.get('CONNECTIONS_TABLE_NAME', 'WuwaDraftConnections')
LOBBIES_TABLE_NAME = os.environ.get('LOBBIES_TABLE_NAME', 'WuwaDraftLobbies')
TURN_DURATION_SECONDS = 30  # 30 seconds per turn
# -------------------

# Initialize DynamoDB resource client
dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)
lobbies_table = dynamodb.Table(LOBBIES_TABLE_NAME)

# Store API Gateway Management client globally? No, create per invocation for endpoint.

def get_apigw_management_client(event):
    """Creates an API Gateway Management API client using the specific endpoint"""
    domain_name = event.get('requestContext', {}).get('domainName')
    stage = event.get('requestContext', {}).get('stage')
    if not domain_name or not stage:
        logger.error("Could not extract domainName or stage from event context")
        raise ValueError("Missing domainName or stage in event context")
    endpoint_url = f"https://{domain_name}/{stage}"
    logger.info(f"Creating ApiGatewayManagementApi client with endpoint: {endpoint_url}")
    return boto3.client('apigatewaymanagementapi', endpoint_url=endpoint_url)

def send_message_to_client(apigw_client, connection_id, payload_dict): # Expects a Python dictionary
    """Sends a JSON payload to a specific connectionId, using DecimalEncoder."""
    logger.info(f"SEND_MSG_CLIENT_ENTRY: Received payload_dict for {connection_id}: {payload_dict}") # Log raw dict
    try:
        # Serialize the dict to JSON string using DecimalEncoder
        payload_json_string = json.dumps(payload_dict, cls=DecimalEncoder)

        # Log exactly what is being prepared to be sent
        logger.info(f"SEND_MESSAGE_TO_CLIENT: Connection: {connection_id}, Payload being sent: {payload_json_string}")

        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=payload_json_string.encode('utf-8') # Encode the string to bytes
        )
        logger.info(f"Message sent successfully to {connection_id}")
        return True
    except apigw_client.exceptions.GoneException:
        logger.warning(f"Client {connection_id} is gone. Cannot send message.")
    except Exception as e:
        # Log the full exception details
        logger.error(f"Failed to post message to connectionId {connection_id}: {str(e)}", exc_info=True) 
    return False

# --- Helper Function to Broadcast Lobby State ---
def broadcast_lobby_state(lobby_id, apigw_client, last_action=None, exclude_connection_id=None):
    try:
        logger.info(f"BROADCAST_LOBBY_STATE: Fetching item for lobby {lobby_id}. Last Action: {last_action}")
        final_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
        final_lobby_item_for_broadcast = final_response.get('Item')

        if not final_lobby_item_for_broadcast:
            logger.warning(f"BROADCAST_LOBBY_STATE: Cannot broadcast, lobby {lobby_id} item not found.")
            return False

        logger.info(f"BROADCAST_LOBBY_STATE_ITEM_DUMP for {lobby_id}: {json.dumps(final_lobby_item_for_broadcast, cls=DecimalEncoder)}")
        
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        # ++ ADD THIS LOG LINE +++++++++++++++++++++++++++++++++++++++++++++++++++
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        logger.info(f"BROADCAST_DEBUG: Lobby {lobby_id} - Value of 'equilibrationEnabled' from DDB for broadcast: {final_lobby_item_for_broadcast.get('equilibrationEnabled')}")
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        # ++ END OF ADDED LOG LINE +++++++++++++++++++++++++++++++++++++++++++++++
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

        state_payload = { # This is a Python dictionary
            "type": "lobbyStateUpdate",
            "lobbyId": lobby_id,
            "hostName": final_lobby_item_for_broadcast.get('hostName'),
            "player1Name": final_lobby_item_for_broadcast.get('player1Name'),
            "player2Name": final_lobby_item_for_broadcast.get('player2Name'),
            "lobbyState": final_lobby_item_for_broadcast.get('lobbyState'),
            "player1Ready": final_lobby_item_for_broadcast.get('player1Ready', False),
            "player2Ready": final_lobby_item_for_broadcast.get('player2Ready', False),
            "currentPhase": final_lobby_item_for_broadcast.get('currentPhase'),
            "currentTurn": final_lobby_item_for_broadcast.get('currentTurn'),
            "bans": final_lobby_item_for_broadcast.get('bans', []),
            "player1Picks": final_lobby_item_for_broadcast.get('player1Picks', []),
            "player2Picks": final_lobby_item_for_broadcast.get('player2Picks', []),
            "availableResonators": final_lobby_item_for_broadcast.get('availableResonators', []),
            "turnExpiresAt": final_lobby_item_for_broadcast.get('turnExpiresAt'),
            "equilibrationEnabled": final_lobby_item_for_broadcast.get('equilibrationEnabled', False),
            "player1ScoreSubmitted": final_lobby_item_for_broadcast.get('player1ScoreSubmitted', False),
            "player2ScoreSubmitted": final_lobby_item_for_broadcast.get('player2ScoreSubmitted', False),
            "player1WeightedBoxScore": final_lobby_item_for_broadcast.get('player1WeightedBoxScore'),
            "player2WeightedBoxScore": final_lobby_item_for_broadcast.get('player2WeightedBoxScore'),
            "player1Sequences": final_lobby_item_for_broadcast.get('player1Sequences'),
            "player2Sequences": final_lobby_item_for_broadcast.get('player2Sequences'),
            "effectiveDraftOrder": final_lobby_item_for_broadcast.get('effectiveDraftOrder'),
            "equilibrationBansAllowed": final_lobby_item_for_broadcast.get('equilibrationBansAllowed', 0),
            "equilibrationBansMade": final_lobby_item_for_broadcast.get('equilibrationBansMade', 0),
            "currentEquilibrationBanner": final_lobby_item_for_broadcast.get('currentEquilibrationBanner')
        }
        if last_action:
            state_payload["lastAction"] = last_action

        # Log the dictionary that is about to be passed to send_message_to_client
        logger.info(f"BROADCAST_LOBBY_STATE: Constructed state_payload DICT for lobby {lobby_id}: {state_payload}")

        participants = [
            final_lobby_item_for_broadcast.get('hostConnectionId'),
            final_lobby_item_for_broadcast.get('player1ConnectionId'),
            final_lobby_item_for_broadcast.get('player2ConnectionId')
        ]
        valid_connection_ids = [pid for pid in participants if pid]

        success_count = 0
        for recipient_id in valid_connection_ids:
            if recipient_id == exclude_connection_id:
                continue
            # Pass the Python dictionary directly.
            # send_message_to_client will handle the serialization with DecimalEncoder.
            if send_message_to_client(apigw_client, recipient_id, state_payload):
                 success_count += 1

        logger.info(f"Broadcast complete for lobby {lobby_id}. Sent to {success_count} participant(s).")
        return True

    except Exception as broadcast_err:
        logger.error(f"Error during broadcast_lobby_state for {lobby_id}: {str(broadcast_err)}", exc_info=True)
        return False

def handler(event, context):
    logger.info(f"Raw event received: {json.dumps(event)}")
    

    connection_id = event.get('requestContext', {}).get('connectionId')
    message_body_str = event.get('body', '{}')
    logger.info(f"Extracted connectionId: {connection_id}, Body string: {message_body_str}") # Existing log might be here or similar

    if not connection_id:
        logger.error("Cannot process message without connectionId")
        return {'statusCode': 400, 'body': 'Cannot process message without connectionId.'}

    # Initialize API Gateway Management client here for sending responses
    try:
        apigw_management_client = get_apigw_management_client(event)
    except ValueError as e:
         return {'statusCode': 500, 'body': str(e)} # Failed to get endpoint info

    # Parse the message body
    try:
        message_data = json.loads(message_body_str)
        action = message_data.get('action')
        player_name = message_data.get('name', 'Unknown') # Get player name if provided

    except json.JSONDecodeError:
        logger.error(f"Received non-JSON message body from {connection_id}: {message_body_str}")
        send_message_to_client(apigw_management_client, connection_id, {
            "type": "error",
            "message": "Invalid message format. Body must be JSON."
        })
        return {'statusCode': 400, 'body': 'Invalid JSON.'}
    except Exception as e:
        logger.error(f"Error processing message setup: {str(e)}")
        return {'statusCode': 500, 'body': 'Internal processing error.'}


    # --- Route based on action ---
    try:
        if action == 'createLobby':
            player_name = message_data.get('name', 'UnknownHost')
            logger.info(f"Processing 'createLobby' action for {connection_id} ({player_name})")

            lobby_id = str(uuid.uuid4())[:8].upper()
            timestamp = datetime.now(timezone.utc).isoformat()
            
            # Get equilibration setting from client message_data
            enable_equilibration = message_data.get('enableEquilibration', True)
            logger.info(f"Lobby {lobby_id} will have equilibration system enabled: {enable_equilibration}")

            new_lobby_item = {
                'lobbyId': lobby_id,
                'hostConnectionId': connection_id,
                'hostName': player_name,
                'lobbyState': 'WAITING',
                'createdAt': timestamp,
                'equilibrationEnabled': enable_equilibration,
                
                # Initialize all player-related fields
                'player1ConnectionId': None,
                'player1Name': None,
                'player1Ready': False,
                'player1Sequences': None,
                'player1WeightedBoxScore': None,
                'player1ScoreSubmitted': False,

                'player2ConnectionId': None,
                'player2Name': None,
                'player2Ready': False,
                'player2Sequences': None,
                'player2WeightedBoxScore': None,
                'player2ScoreSubmitted': False,
                
                # Draft state fields
                'currentPhase': None,
                'currentTurn': None,
                'currentStepIndex': None,
                'turnExpiresAt': None,
                'bans': [],
                'player1Picks': [],
                'player2Picks': [],
                'availableResonators': list(ALL_RESONATOR_NAMES),
                
                # Equilibration-specific fields
                'effectiveDraftOrder': None,
                'equilibrationBansTarget': 0,
                'equilibrationBansMade': 0,
                'lastAction': f"{player_name} created the lobby (Equilibration: {'ON' if enable_equilibration else 'OFF'})."
            }
            
            lobbies_table.put_item(Item=new_lobby_item)
            logger.info(f"Lobby item created in {LOBBIES_TABLE_NAME} with ID {lobby_id}")

            # Update the connection item for the host
            connections_table.update_item(
                Key={'connectionId': connection_id},
                UpdateExpression="SET currentLobbyId = :lid, playerName = :pn",
                ExpressionAttributeValues={':lid': lobby_id, ':pn': player_name}
            )
            logger.info(f"Connection item for host {connection_id} updated in {CONNECTIONS_TABLE_NAME}")

            # Send confirmation back to the host
            response_payload = {
                "type": "lobbyCreated",
                "lobbyId": lobby_id,
                "isHost": True,
                "message": f"Lobby {lobby_id} created successfully.",
                "equilibrationEnabled": enable_equilibration
            }
            send_message_to_client(apigw_management_client, connection_id, response_payload)

            return {'statusCode': 200, 'body': 'Lobby created.'}

        elif action == 'joinLobby':
            lobby_id = message_data.get('lobbyId')
            player_name = message_data.get('name', 'Player') # Use provided name

            if not lobby_id:
                logger.error(f"Join request from {connection_id} missing lobbyId.")
                send_message_to_client(apigw_management_client, connection_id, {
                    "type": "error", "message": "Lobby ID is required to join."
                })
                return {'statusCode': 400, 'body': 'Missing lobbyId.'}

            logger.info(f"Processing 'joinLobby' for {connection_id} ({player_name}) into lobby {lobby_id}")

            # 1. Get the current lobby state
            try:
                response = lobbies_table.get_item(Key={'lobbyId': lobby_id})
                lobby_item = response.get('Item')

                if not lobby_item:
                    logger.warning(f"Lobby {lobby_id} not found for connection {connection_id}.")
                    send_message_to_client(apigw_management_client, connection_id, {
                        "type": "error", "message": f"Lobby {lobby_id} not found."
                    })
                    return {'statusCode': 404, 'body': 'Lobby not found.'}

                logger.info(f"Found lobby item: {lobby_item}")

                # 2. Check if lobby is full and assign slot
                assigned_slot = None
                update_expression_parts = []
                expression_attribute_values = {}
                expression_attribute_names = {} # Needed if attributes conflict with reserved words

                # Check Player 1 slot
                # Use .get() which returns None if key doesn't exist or value is explicitly None
                if lobby_item.get('player1ConnectionId') is None:
                    assigned_slot = 'P1'
                    update_expression_parts.append("#p1ConnId = :connId")
                    update_expression_parts.append("#p1Name = :pName")
                    expression_attribute_names["#p1ConnId"] = "player1ConnectionId"
                    expression_attribute_names["#p1Name"] = "player1Name"
                    expression_attribute_values[":connId"] = connection_id
                    expression_attribute_values[":pName"] = player_name
                # Check Player 2 slot
                elif lobby_item.get('player2ConnectionId') is None:
                    assigned_slot = 'P2'
                    update_expression_parts.append("#p2ConnId = :connId")
                    update_expression_parts.append("#p2Name = :pName")
                    expression_attribute_names["#p2ConnId"] = "player2ConnectionId"
                    expression_attribute_names["#p2Name"] = "player2Name"
                    expression_attribute_values[":connId"] = connection_id
                    expression_attribute_values[":pName"] = player_name
                else:
                    # Lobby is full
                    logger.warning(f"Lobby {lobby_id} is full. Cannot add {connection_id}.")
                    send_message_to_client(apigw_management_client, connection_id, {
                        "type": "error", "message": f"Lobby {lobby_id} is full."
                    })
                    return {'statusCode': 400, 'body': 'Lobby is full.'}

                # TODO: Add check if connection_id is already hostConnectionId, P1, or P2

                # 3. Update the lobby item in WuwaDraftLobbies
                update_expression = "SET " + ", ".join(update_expression_parts)
                logger.info(f"Updating lobby {lobby_id} with UpdateExpression: {update_expression}, Values: {expression_attribute_values}")

                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression,
                    ExpressionAttributeNames=expression_attribute_names,
                    ExpressionAttributeValues=expression_attribute_values
                )
                logger.info(f"Lobby {lobby_id} updated successfully with {connection_id} as {assigned_slot}")

                # 4. Update the connection item for the joining player in WuwaDraftConnections
                connections_table.update_item(
                    Key={'connectionId': connection_id},
                    UpdateExpression="SET currentLobbyId = :lid, playerName = :pn",
                    ExpressionAttributeValues={
                        ':lid': lobby_id,
                        ':pn': player_name
                    }
                )
                logger.info(f"Connection item updated for {connection_id}")

                # 5. Send confirmation back to the joining player
                response_payload = {
                    "type": "lobbyJoined",
                    "lobbyId": lobby_id,
                    "assignedSlot": assigned_slot,
                    "isHost": False, 
                    "message": f"Successfully joined lobby {lobby_id} as {assigned_slot}.",
                    "equilibrationEnabled": lobby_item.get('equilibrationEnabled', False),
                    "playerScoreSubmitted": False  # Explicitly set to False for this join/rejoin into slot
                }
                send_message_to_client(apigw_management_client, connection_id, response_payload)

                # --- BEGIN NOTIFICATION BLOCK ---
                # Fetch the latest lobby state again to ensure we have player names/IDs
                try:
                    logger.info(f"JOIN_LOBBY_BROADCAST: Attempting to fetch lobby item for broadcast. LobbyID: {lobby_id}")
                    updated_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                    updated_lobby_item = updated_response.get('Item')

                    if not updated_lobby_item:
                        logger.error(f"JOIN_LOBBY_BROADCAST_ERROR: Lobby item for {lobby_id} is NULL after get_item for broadcast.")
                        # Don't fail the whole join, just log error and return
                        return {'statusCode': 200, 'body': 'Player joined lobby, but failed to broadcast update.'}

                    # VERY IMPORTANT LOGS:
                    p1_score_submitted_from_db = updated_lobby_item.get('player1ScoreSubmitted')
                    p2_score_submitted_from_db = updated_lobby_item.get('player2ScoreSubmitted')
                    logger.info(f"JOIN_LOBBY_BROADCAST_DATA: LobbyID: {lobby_id}, Fetched P1ScoreSubmitted: {p1_score_submitted_from_db} (type: {type(p1_score_submitted_from_db)})")
                    logger.info(f"JOIN_LOBBY_BROADCAST_DATA: LobbyID: {lobby_id}, Fetched P2ScoreSubmitted: {p2_score_submitted_from_db} (type: {type(p2_score_submitted_from_db)})")
                    # Log the entire item to be sure
                    logger.info(f"JOIN_LOBBY_BROADCAST_FULL_ITEM: {json.dumps(updated_lobby_item, cls=DecimalEncoder)}")

                    # Prepare the state update payload
                    state_payload = {
                        "type": "lobbyStateUpdate",
                        "lobbyId": lobby_id,
                        "hostName": updated_lobby_item.get('hostName'),
                        "player1Name": updated_lobby_item.get('player1Name'),
                        "player2Name": updated_lobby_item.get('player2Name'),
                        "lobbyState": updated_lobby_item.get('lobbyState', 'WAITING'),
                        "player1Ready": updated_lobby_item.get('player1Ready', False),
                        "player2Ready": updated_lobby_item.get('player2Ready', False),
                        "equilibrationEnabled": updated_lobby_item.get('equilibrationEnabled', False),
                        "currentPhase": updated_lobby_item.get('currentPhase'),
                        "currentTurn": updated_lobby_item.get('currentTurn'),
                        "bans": updated_lobby_item.get('bans', []),
                        "player1Picks": updated_lobby_item.get('player1Picks', []),
                        "player2Picks": updated_lobby_item.get('player2Picks', []),
                        "availableResonators": updated_lobby_item.get('availableResonators', []),
                        "turnExpiresAt": updated_lobby_item.get('turnExpiresAt'),
                        "player1ScoreSubmitted": bool(p1_score_submitted_from_db),  # Explicitly cast to bool after logging
                        "player2ScoreSubmitted": bool(p2_score_submitted_from_db),   # Explicitly cast to bool after logging
                        "player1WeightedBoxScore": updated_lobby_item.get('player1WeightedBoxScore'),
                        "player2WeightedBoxScore": updated_lobby_item.get('player2WeightedBoxScore'),
                        "player1Sequences": updated_lobby_item.get('player1Sequences'),
                        "player2Sequences": updated_lobby_item.get('player2Sequences'),
                        "effectiveDraftOrder": updated_lobby_item.get('effectiveDraftOrder'),
                        "equilibrationBansAllowed": updated_lobby_item.get('equilibrationBansAllowed', 0),
                        "equilibrationBansMade": updated_lobby_item.get('equilibrationBansMade', 0),
                        "currentEquilibrationBanner": updated_lobby_item.get('currentEquilibrationBanner'),
                        "lastAction": f"{player_name} joined as {assigned_slot}."
                        
                    }
                    if not state_payload.get('lastAction'): # If not already set by some other logic
                        joining_player_name_for_action = player_name # This is the name of the player who just joined
                        joining_player_assigned_slot = assigned_slot # This is the slot they were assigned
                        state_payload['lastAction'] = f"{joining_player_name_for_action} joined as {joining_player_assigned_slot}."
                    logger.info(f"JOIN_LOBBY_BROADCAST_PAYLOAD: Broadcasting lobby state update: {json.dumps(state_payload, cls=DecimalEncoder)}")

                    # Get all current participant connection IDs
                    participants = [
                        updated_lobby_item.get('hostConnectionId'),
                        updated_lobby_item.get('player1ConnectionId'),
                        updated_lobby_item.get('player2ConnectionId')
                    ]
                    # Filter out any None values (e.g., if P2 hasn't joined yet)
                    valid_connection_ids = [pid for pid in participants if pid]

                    # Send the update to ALL participants
                    failed_sends = []
                    for recipient_id in valid_connection_ids:
                        if not send_message_to_client(apigw_management_client, recipient_id, state_payload):
                             # Track failures (e.g., if someone disconnected just now)
                             failed_sends.append(recipient_id)

                    if failed_sends:
                         logger.warning(f"Failed to send state update to some connections: {failed_sends}")

                except Exception as broadcast_err:
                     # Log error during broadcast but don't fail the join operation itself
                     logger.error(f"Error broadcasting lobby state update for {lobby_id}: {str(broadcast_err)}", exc_info=True)
                # --- END NOTIFICATION BLOCK ---

                return {'statusCode': 200, 'body': 'Player joined lobby.'}

            except Exception as e:
                logger.error(f"Error joining lobby {lobby_id} for {connection_id}: {str(e)}", exc_info=True)
                send_message_to_client(apigw_management_client, connection_id, {
                    "type": "error", "message": f"Failed to join lobby: {str(e)}"
                })
                return {'statusCode': 500, 'body': 'Failed to join lobby.'}

        elif action == 'playerReady':
            logger.info(f"Processing 'playerReady' action for {connection_id}")

            # 1. Find which lobby the sender is in from Connections table
            try:
                connection_item = connections_table.get_item(Key={'connectionId': connection_id}).get('Item')
                if not connection_item or 'currentLobbyId' not in connection_item:
                    logger.warning(f"Connection {connection_id} not found or not in a lobby.")
                    return {'statusCode': 404, 'body': 'Connection not associated with a lobby.'}
                lobby_id = connection_item['currentLobbyId']
                player_name = connection_item.get('playerName', 'Unknown') # Get name from connection record
                logger.info(f"Found lobby {lobby_id} for connection {connection_id}")
            except Exception as e:
                 logger.error(f"Failed to get connection details for {connection_id}: {str(e)}")
                 return {'statusCode': 500, 'body': 'Error finding connection details.'}

            # 2. Get the current lobby state with ConsistentRead
            try:
                response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                lobby_item = response.get('Item')
                if not lobby_item:
                    logger.warning(f"Lobby {lobby_id} not found (though connection table referenced it).")
                    return {'statusCode': 404, 'body': 'Lobby data not found.'}
                logger.info(f"Found lobby item: {lobby_item}")
            except Exception as e:
                 logger.error(f"Failed to get lobby {lobby_id}: {str(e)}")
                 return {'statusCode': 500, 'body': 'Error fetching lobby data.'}

            # 3. Determine player slot and prepare update
            player_slot_key = None
            ready_flag_key = None
            if lobby_item.get('player1ConnectionId') == connection_id:
                player_slot_key = 'player1'
                ready_flag_key = 'player1Ready'
            elif lobby_item.get('player2ConnectionId') == connection_id:
                player_slot_key = 'player2'
                ready_flag_key = 'player2Ready'
            else:
                logger.warning(f"Connection {connection_id} sent 'playerReady' but is not P1 or P2 in lobby {lobby_id}.")
                return {'statusCode': 200, 'body': 'Ready signal ignored (not P1 or P2).'}

            # Define the current event's last action message early
            current_event_last_action = f"{player_name} ({player_slot_key}) is Ready."

            # 4. Update the player's ready status in WuwaDraftLobbies
            try:
                logger.info(f"Updating {player_slot_key} ready status to True in lobby {lobby_id}")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=f"SET {ready_flag_key} = :true",
                    ExpressionAttributeValues={':true': True}
                )
                logger.info(f"Updated {player_slot_key} ready status in lobby {lobby_id}")
            except Exception as e:
                 logger.error(f"Failed to update ready status for {player_slot_key} in {lobby_id}: {str(e)}")
                 return {'statusCode': 500, 'body': 'Failed to update ready status.'}

            # 5. Re-fetch the LATEST lobby state AFTER the update
            try:
                logger.info(f"Re-fetching lobby state for {lobby_id} after ready update.")
                updated_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                updated_lobby_item = updated_response.get('Item')
                if not updated_lobby_item:
                    logger.error(f"Could not re-fetch lobby {lobby_id} after ready update.")
                    return {'statusCode': 500, 'body': 'Failed to fetch updated lobby state.'}
            except Exception as e:
                 logger.error(f"Failed to re-fetch lobby {lobby_id} after ready update: {str(e)}")
                 return {'statusCode': 500, 'body': 'Error fetching updated lobby state.'}

            p1_ready = updated_lobby_item.get('player1Ready', False)
            p2_ready = updated_lobby_item.get('player2Ready', False)
            current_lobby_state_from_db = updated_lobby_item.get('lobbyState', 'WAITING')

            draft_initialization_payload = {} # To store what needs to be updated in DDB

            if p1_ready and p2_ready and current_lobby_state_from_db == 'WAITING':
                logger.info(f"Lobby {lobby_id}: Both players ready.")
                is_equilibration_active = updated_lobby_item.get('equilibrationEnabled', False)
                
                # Initialize variables for draft setup
                effective_draft_order_to_use = []
                assigned_player_roles = {} # Stores how P1/P2 map to roles in the chosen template
                last_action_for_draft_start = "Draft starting."

                if is_equilibration_active:
                    logger.info(f"Lobby {lobby_id}: Equilibration is ON.")
                    player1_score_submitted = updated_lobby_item.get('player1ScoreSubmitted', False)
                    player2_score_submitted = updated_lobby_item.get('player2ScoreSubmitted', False)

                    if not (player1_score_submitted and player2_score_submitted):
                        logger.warning(f"Lobby {lobby_id}: Equilibration ON, but not all scores submitted. P1: {player1_score_submitted}, P2: {player2_score_submitted}")
                        # Send error back to the player who just readied up
                        send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Cannot start draft, all players must submit Box Scores first."})
                        # Broadcast current WAITING state which should show who hasn't submitted
                        broadcast_lobby_state(lobby_id, apigw_management_client, last_action="Waiting for all Box Scores to be submitted.")
                        return {'statusCode': 200, 'body': 'Waiting for scores.'}

                    # --- SCORES ARE SUBMITTED, PROCEED WITH EQUILIBRATION ---
                    p1_score = updated_lobby_item.get('player1WeightedBoxScore', 0) # Default to 0 if somehow None/missing
                    p2_score = updated_lobby_item.get('player2WeightedBoxScore', 0) # Default to 0
                    
                    # Ensure scores are numbers (they should be if submitBoxScore worked)
                    p1_score = int(p1_score) if p1_score is not None else 0
                    p2_score = int(p2_score) if p2_score is not None else 0

                    logger.info(f"Lobby {lobby_id}: P1 Score={p1_score}, P2 Score={p2_score}")
                    weighted_score_diff = abs(p1_score - p2_score)
                    logger.info(f"Lobby {lobby_id}: Weighted Score Difference = {weighted_score_diff}")

                    lower_score_player_slot = None
                    # Determine Lower Score Player (LSP)
                    if p1_score < p2_score:
                        lower_score_player_slot = 'P1'
                    elif p2_score < p1_score:
                        lower_score_player_slot = 'P2'
                    # If scores are equal, there's no LSP for priority in P1_FAVORED, but threshold still matters for NEUTRAL vs P1_FAVORED

                    # A. Draft Order Priority Determination (Proposal Step 4A)
                    if weighted_score_diff < SCORE_DIFF_THRESHOLD_MINOR_P1_PRIORITY:
                        logger.info(f"Lobby {lobby_id}: Score diff ({weighted_score_diff}) < {SCORE_DIFF_THRESHOLD_MINOR_P1_PRIORITY}. Using NEUTRAL_DRAFT_ORDER.")
                        effective_draft_order_to_use = NEUTRAL_DRAFT_ORDER_TEMPLATE_V2
                        
                        # Randomly assign ROLE_A and ROLE_B to P1 and P2
                        players = ['P1', 'P2']
                        random.shuffle(players)
                        # 'playerRoles' will map the template's ROLE_A/ROLE_B to actual P1/P2
                        # e.g., if players = ['P2', 'P1'], then ROLE_A is P2, ROLE_B is P1
                        assigned_player_roles = {'ROLE_A': players[0], 'ROLE_B': players[1]}
                        logger.info(f"Lobby {lobby_id}: Neutral order roles assigned: {assigned_player_roles}")
                        last_action_for_draft_start = f"Scores close ({p1_score} vs {p2_score}). Neutral draft order. {assigned_player_roles['ROLE_A']} is ROLE_A, {assigned_player_roles['ROLE_B']} is ROLE_B."
                    else: # weighted_score_diff >= SCORE_DIFF_THRESHOLD_MINOR_P1_PRIORITY
                        logger.info(f"Lobby {lobby_id}: Score diff ({weighted_score_diff}) >= {SCORE_DIFF_THRESHOLD_MINOR_P1_PRIORITY}. Using P1_FAVORED_DRAFT_ORDER.")
                        effective_draft_order_to_use = P1_FAVORED_DRAFT_ORDER
                        
                        if lower_score_player_slot == 'P1':
                            # P1 (LSP) gets the 'P1' role in P1_FAVORED_DRAFT_ORDER
                            assigned_player_roles = {'P1_ROLE_IN_TEMPLATE': 'P1', 'P2_ROLE_IN_TEMPLATE': 'P2'}
                            last_action_for_draft_start = f"P1 ({p1_score}) has lower score than P2 ({p2_score}). P1 gets favored draft order."
                        elif lower_score_player_slot == 'P2':
                            # P2 (LSP) gets the 'P1' role in P1_FAVORED_DRAFT_ORDER
                            assigned_player_roles = {'P1_ROLE_IN_TEMPLATE': 'P2', 'P2_ROLE_IN_TEMPLATE': 'P1'}
                            last_action_for_draft_start = f"P2 ({p2_score}) has lower score than P1 ({p1_score}). P2 gets favored draft order."
                        else: # Scores are equal (but diff >= threshold, which means threshold is 0 and scores are equal)
                              # OR one player had 0 and other had exactly threshold_minor.
                              # Default to P1 getting the P1_ROLE if no clear LSP or scores are equal at threshold.
                            logger.info(f"Lobby {lobby_id}: Score diff {weighted_score_diff} with no clear LSP (or equal scores at threshold). P1 defaults to favored P1_ROLE.")
                            assigned_player_roles = {'P1_ROLE_IN_TEMPLATE': 'P1', 'P2_ROLE_IN_TEMPLATE': 'P2'}
                            last_action_for_draft_start = f"Scores at {weighted_score_diff} difference. P1 gets favored draft order by default."
                        logger.info(f"Lobby {lobby_id}: P1 Favored order roles: {assigned_player_roles} (P1_ROLE_IN_TEMPLATE is the player taking the 'P1' slot in P1_FAVORED_DRAFT_ORDER)")

                    draft_initialization_payload['effectiveDraftOrder'] = effective_draft_order_to_use
                    draft_initialization_payload['playerRoles'] = assigned_player_roles

                    # B. Conditional Equilibration Pool Ban(s) for LSP (Proposal Step 4B)
                    num_equilibration_bans = 0
                    equilibration_banner_slot = None # This is the LSP who gets to make EQ bans
                    lsp_gets_draft_priority = (weighted_score_diff >= SCORE_DIFF_THRESHOLD_MINOR_P1_PRIORITY) # True if not neutral

                    if lsp_gets_draft_priority and lower_score_player_slot: # lower_score_player_slot was determined earlier
                        equilibration_banner_slot = lower_score_player_slot
                        
                        # Check thresholds for EQ bans (these apply only if LSP already has draft order priority)
                        if SCORE_DIFF_THRESHOLD_MAJOR_ONE_EQ_BAN <= weighted_score_diff < SCORE_DIFF_THRESHOLD_EXTREME_TWO_EQ_BANS:
                            num_equilibration_bans = 1
                            logger.info(f"Lobby {lobby_id}: LSP ({equilibration_banner_slot}) gets 1 Equilibration Ban (score diff: {weighted_score_diff}).")
                        elif weighted_score_diff >= SCORE_DIFF_THRESHOLD_EXTREME_TWO_EQ_BANS:
                            num_equilibration_bans = 2
                            logger.info(f"Lobby {lobby_id}: LSP ({equilibration_banner_slot}) gets 2 Equilibration Bans (score diff: {weighted_score_diff}).")
                        else:
                            logger.info(f"Lobby {lobby_id}: Score difference ({weighted_score_diff}) grants P1 favored order but no Equilibration Bans.")
                    else:
                        logger.info(f"Lobby {lobby_id}: No LSP priority or no clear LSP for Equilibration Bans (neutral order or equal scores below major threshold).")

                    logger.info(f"Lobby {lobby_id}: Both players ready. BSS results calculated. Transitioning to PRE_DRAFT_READY state.")
                    logger.info(f"Lobby {lobby_id}: Calculated BSS - Draft Order: {effective_draft_order_to_use}, Roles: {assigned_player_roles}, EQ Bans Allowed: {num_equilibration_bans}, EQ Banner: {equilibration_banner_slot}")

                    # This will be the payload used for the DynamoDB update for the PRE_DRAFT_READY state
                    draft_initialization_payload = {
                        'lobbyState': PRE_DRAFT_READY_STATE,
                        'equilibrationEnabled': is_equilibration_active, # IMPORTANT: Preserve this flag

                        # Store the results of BSS calculations
                        'effectiveDraftOrder': effective_draft_order_to_use,
                        'playerRoles': assigned_player_roles,
                        'equilibrationBansAllowed': num_equilibration_bans,
                        'currentEquilibrationBanner': equilibration_banner_slot,
                        'equilibrationBansMade': 0, # Always initialize to 0 here

                        # Ensure active draft turn fields are None (draft hasn't started)
                        'currentPhase': None,
                        'currentTurn': None,
                        'currentStepIndex': None,
                        'turnExpiresAt': None,

                        # Initialize/reset draft lists
                        'availableResonators': list(ALL_RESONATOR_NAMES),
                        'bans': [],
                        'player1Picks': [],
                        'player2Picks': [],

                        # Appropriate last action message
                        'lastAction': f"{last_action_for_draft_start} All players ready. Waiting for Host to start draft."
                    }

                    # --- DynamoDB update logic using the new draft_initialization_payload ---
                    try:
                        update_expression_parts = []
                        expression_attribute_values = {}
                        expression_attribute_names = {}

                        for key, value in draft_initialization_payload.items():
                            name_placeholder = f"#{key}_attr"
                            value_placeholder = f":val_{key}"
                            
                            update_expression_parts.append(f"{name_placeholder} = {value_placeholder}")
                            expression_attribute_names[name_placeholder] = key
                            expression_attribute_values[value_placeholder] = value
                        
                        expression_attribute_values[':waitState'] = 'WAITING' # Condition: lobby was in WAITING
                        expression_attribute_names['#lobbyState_cond'] = 'lobbyState'
                        condition_item_expression = "#lobbyState_cond = :waitState"

                        update_item_expression = "SET " + ", ".join(update_expression_parts)
                        
                        logger.info(f"Lobby {lobby_id}: Updating DDB to PRE_DRAFT_READY. Expression: {update_item_expression}")
                        logger.info(f"Lobby {lobby_id}: Names: {expression_attribute_names}")
                        logger.info(f"Lobby {lobby_id}: Values: {json.dumps(expression_attribute_values, cls=DecimalEncoder, indent=2)}")
                        
                        lobbies_table.update_item(
                            Key={'lobbyId': lobby_id},
                            UpdateExpression=update_item_expression,
                            ConditionExpression=condition_item_expression,
                            ExpressionAttributeNames=expression_attribute_names,
                            ExpressionAttributeValues=expression_attribute_values
                        )
                        logger.info(f"Lobby {lobby_id} successfully updated to PRE_DRAFT_READY state.")

                    except Exception as e:
                        logger.error(f"Lobby {lobby_id}: Error updating DDB to PRE_DRAFT_READY state: {str(e)}", exc_info=True)
                        raise

                    final_last_action = draft_initialization_payload.get('lastAction')
                    broadcast_lobby_state(lobby_id, apigw_management_client, last_action=final_last_action)

                else: # Equilibration is OFF
                    logger.info(f"Lobby {lobby_id}: Equilibration is OFF. Using NEUTRAL_DRAFT_ORDER with random roles.")
                    effective_draft_order_to_use = NEUTRAL_DRAFT_ORDER_TEMPLATE_V2
                    players = ['P1', 'P2']
                    random.shuffle(players)
                    assigned_player_roles = {'ROLE_A': players[0], 'ROLE_B': players[1]}
                    logger.info(f"Lobby {lobby_id}: Neutral order roles assigned: {assigned_player_roles}")
                    last_action_for_draft_start = f"Draft starting with neutral order. {assigned_player_roles['ROLE_A']} is ROLE_A, {assigned_player_roles['ROLE_B']} is ROLE_B."
                    
                    logger.info(f"Lobby {lobby_id}: Both players ready. BSS processing complete. is_equilibration_active = False. Transitioning to PRE_DRAFT_READY state.")

                    pre_draft_payload = {
                        'lobbyState': PRE_DRAFT_READY_STATE,
                        'equilibrationEnabled': False, # Explicitly set to False when equilibration is OFF
                        'effectiveDraftOrder': effective_draft_order_to_use,
                        'playerRoles': assigned_player_roles,
                        'equilibrationBansAllowed': 0,
                        'currentEquilibrationBanner': None,
                        'equilibrationBansMade': 0,
                        'currentPhase': None,
                        'currentTurn': None,
                        'currentStepIndex': None,
                        'turnExpiresAt': None,
                        'availableResonators': list(ALL_RESONATOR_NAMES),
                        'bans': [],
                        'player1Picks': [],
                        'player2Picks': [],
                        'lastAction': f"{last_action_for_draft_start} All players ready. Waiting for Host to start draft."
                    }

                    try:
                        update_expression_parts = []
                        expression_attribute_values = {}
                        expression_attribute_names = {} 

                        for key, value in pre_draft_payload.items():
                            name_placeholder = f"#{key}_attr" 
                            value_placeholder = f":val_{key}" 
                            
                            update_expression_parts.append(f"{name_placeholder} = {value_placeholder}")
                            expression_attribute_names[name_placeholder] = key
                            expression_attribute_values[value_placeholder] = value
                        
                        expression_attribute_values[':waitState'] = 'WAITING' 
                        expression_attribute_names['#lobbyState_cond'] = 'lobbyState'
                        condition_item_expression = "#lobbyState_cond = :waitState"

                        update_item_expression = "SET " + ", ".join(update_expression_parts)
                        
                        lobbies_table.update_item(
                            Key={'lobbyId': lobby_id},
                            UpdateExpression=update_item_expression,
                            ConditionExpression=condition_item_expression,
                            ExpressionAttributeNames=expression_attribute_names,
                            ExpressionAttributeValues=expression_attribute_values
                        )
                        logger.info(f"Lobby {lobby_id} successfully updated to PRE_DRAFT_READY state.")

                    except Exception as e:
                        logger.error(f"Lobby {lobby_id}: Error updating DDB to PRE_DRAFT_READY state: {str(e)}", exc_info=True)
                        raise 

                    final_last_action = pre_draft_payload.get('lastAction')
                    broadcast_lobby_state(lobby_id, apigw_management_client, last_action=final_last_action)

            # If not all conditions met to go to PRE_DRAFT_READY (e.g., only one player ready)
            # or if the PRE_DRAFT_READY logic path didn't execute/return:
            broadcast_lobby_state(lobby_id, apigw_management_client, last_action=current_event_last_action)
            logger.info(f"Lobby {lobby_id}: Broadcast initiated from playerReady.")

            return {'statusCode': 200, 'body': 'Player readiness updated.'}

        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        # ++ ADD THIS NEW ELIF BLOCK FOR 'hostStartsDraft' +++++++++++++++++++++++
        # ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        elif action == 'hostStartsDraft':
            logger.info(f"Processing 'hostStartsDraft' action for connection {connection_id}")
            lobby_id = message_data.get('lobbyId')

            if not lobby_id:
                logger.warning(f"hostStartsDraft request from {connection_id} missing lobbyId.")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Lobby ID missing for starting draft."})
                return {'statusCode': 400, 'body': 'Missing lobbyId.'}

            try:
                # Get the current lobby state with ConsistentRead
                response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                lobby_item = response.get('Item')

                if not lobby_item:
                    logger.warning(f"Lobby {lobby_id} not found for hostStartsDraft by {connection_id}.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Lobby not found."})
                    return {'statusCode': 404, 'body': 'Lobby not found.'}

                logger.info(f"Lobby {lobby_id} found. Current state: {lobby_item.get('lobbyState')}")

                # --- Step 1.5: Validation Logic ---
                # 1. Verify the sender is the host
                host_connection_id = lobby_item.get('hostConnectionId')
                if connection_id != host_connection_id:
                    logger.warning(f"Unauthorized 'hostStartsDraft' attempt on lobby {lobby_id} by non-host {connection_id}. Host is {host_connection_id}.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Only the host can start the draft."})
                    return {'statusCode': 403, 'body': 'Forbidden: Not the host.'}

                # 2. Verify the lobby is in the PRE_DRAFT_READY_STATE
                if lobby_item.get('lobbyState') != PRE_DRAFT_READY_STATE:
                    logger.warning(f"Host {connection_id} attempted to start draft for lobby {lobby_id}, but lobby is not in PRE_DRAFT_READY state. Current state: {lobby_item.get('lobbyState')}.")
                    send_message_to_client(apigw_management_client, connection_id, {
                        "type": "error",
                        "message": f"Cannot start draft. Lobby is not in the correct state (current: {lobby_item.get('lobbyState')}). Ensure all players are ready and BSS is complete if enabled."
                    })
                    return {'statusCode': 400, 'body': 'Lobby not in PRE_DRAFT_READY state.'}
                
                logger.info(f"Host {connection_id} validated for starting draft in lobby {lobby_id} (State: {PRE_DRAFT_READY_STATE}).")
                # --- End of Step 1.5 Validation Logic ---

                # --- Step 1.6: Draft Initiation Logic ---
                # Retrieve the pre-calculated BSS results and draft setup from the lobby item
                effective_draft_order_to_use = lobby_item.get('effectiveDraftOrder')
                assigned_player_roles = lobby_item.get('playerRoles', {}) # Default to empty dict if missing
                num_equilibration_bans = lobby_item.get('equilibrationBansAllowed', 0)
                equilibration_banner_slot = lobby_item.get('currentEquilibrationBanner') # This is 'P1' or 'P2'
                
                # Ensure essential draft setup data is present
                if not effective_draft_order_to_use or not assigned_player_roles:
                    logger.error(f"Lobby {lobby_id}: Critical draft setup data (effectiveDraftOrder or playerRoles) missing from PRE_DRAFT_READY state.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Internal server error: Draft setup data missing."})
                    return {'statusCode': 500, 'body': 'Draft setup data missing.'}

                draft_start_payload = {
                    'lobbyState': 'DRAFTING', # Transition to active drafting
                }

                if num_equilibration_bans > 0 and equilibration_banner_slot:
                    # --- SETUP FOR EQUILIBRATION BAN PHASE ---
                    logger.info(f"Lobby {lobby_id}: Host starting draft. Initiating {EQUILIBRATION_PHASE_NAME} for {equilibration_banner_slot}.")
                    eq_ban_expires_at_dt = datetime.now(timezone.utc) + timedelta(seconds=EQUILIBRATION_PHASE_TIMEOUT_SECONDS)
                    
                    draft_start_payload.update({
                        'currentPhase': EQUILIBRATION_PHASE_NAME,
                        'currentTurn': equilibration_banner_slot,
                        'currentStepIndex': -1, # Or 0 if you count EQ bans as steps in an order
                        'turnExpiresAt': eq_ban_expires_at_dt.isoformat(),
                        'lastAction': f"Host started the draft. {equilibration_banner_slot} to make {num_equilibration_bans} Equilibration Ban(s)."
                    })
                else:
                    # --- NO EQUILIBRATION BANS (or BSS was off), SETUP FOR STANDARD DRAFT ---
                    logger.info(f"Lobby {lobby_id}: Host starting draft. Initiating standard draft sequence.")
                    
                    first_step_info = effective_draft_order_to_use[0] # Get the first step from the stored order
                    first_phase_from_order = first_step_info['phase']
                    first_turn_role_in_template = first_step_info['turnPlayerDesignation'] # e.g., 'ROLE_A' or 'P1_ROLE'
                    
                    # Resolve the actual player ('P1' or 'P2') for the first turn
                    actual_current_turn = resolve_turn_from_role(first_turn_role_in_template, assigned_player_roles)
                    
                    if not actual_current_turn:
                        logger.error(f"Lobby {lobby_id}: CRITICAL - Could not resolve actual current turn for standard draft start from stored roles. Roles: {assigned_player_roles}, Designation: {first_turn_role_in_template}")
                        send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Internal server error: Could not determine first turn."})
                        return {'statusCode': 500, 'body': 'Could not determine first turn.'}

                    std_turn_expires_at_dt = datetime.now(timezone.utc) + timedelta(seconds=TURN_DURATION_SECONDS)
                    
                    draft_start_payload.update({
                        'currentPhase': first_phase_from_order,
                        'currentTurn': actual_current_turn,
                        'currentStepIndex': 0, # Start at the first step of the standard order
                        'turnExpiresAt': std_turn_expires_at_dt.isoformat(),
                        'lastAction': f"Host started the draft. {actual_current_turn} to {first_phase_from_order.split('1')[0]}." # e.g., P1 to BAN.
                    })

                # --- Update DynamoDB ---
                try:
                    update_expression_parts = []
                    expression_attribute_values = {}
                    expression_attribute_names = {}

                    for key, value in draft_start_payload.items():
                        name_placeholder = f"#{key}_attr"
                        value_placeholder = f":val_{key}"
                        
                        update_expression_parts.append(f"{name_placeholder} = {value_placeholder}")
                        expression_attribute_names[name_placeholder] = key
                        expression_attribute_values[value_placeholder] = value
                    
                    # Condition: ensure lobby is still in PRE_DRAFT_READY state and this is the host
                    expression_attribute_values[':expected_state'] = PRE_DRAFT_READY_STATE
                    expression_attribute_values[':host_conn_id_cond'] = connection_id # The current connection_id (host)
                    
                    expression_attribute_names['#lobbyState_cond'] = 'lobbyState'
                    expression_attribute_names['#hostConnId_cond'] = 'hostConnectionId'
                    
                    update_item_expression = "SET " + ", ".join(update_expression_parts)
                    condition_item_expression = "#lobbyState_cond = :expected_state AND #hostConnId_cond = :host_conn_id_cond"

                    logger.info(f"Lobby {lobby_id}: Host starting draft. Update Expression: {update_item_expression}")
                    logger.info(f"Lobby {lobby_id}: ExpressionAttributeNames: {expression_attribute_names}")
                    logger.info(f"Lobby {lobby_id}: ExpressionAttributeValues: {json.dumps(expression_attribute_values, cls=DecimalEncoder, indent=2)}")
                    
                    lobbies_table.update_item(
                        Key={'lobbyId': lobby_id},
                        UpdateExpression=update_item_expression,
                        ConditionExpression=condition_item_expression,
                        ExpressionAttributeNames=expression_attribute_names,
                        ExpressionAttributeValues=expression_attribute_values
                    )
                    logger.info(f"Lobby {lobby_id} successfully updated by host to start the draft.")

                except ClientError as e:
                    if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                        logger.warning(f"Lobby {lobby_id}: Conditional check failed for hostStartsDraft. State might have changed or not host. Current state in DB: {lobby_item.get('lobbyState')}")
                        send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Failed to start draft, state changed or action not allowed."})
                        # Broadcast current state so host sees the actual situation
                        broadcast_lobby_state(lobby_id, apigw_management_client, last_action="Failed attempt to start draft due to state conflict.")
                        return {'statusCode': 409, 'body': 'Conflict, state changed or not authorized.'}
                    else:
                        logger.error(f"Lobby {lobby_id}: ClientError updating DDB for hostStartsDraft: {str(e)}", exc_info=True)
                        raise # Re-raise to be caught by the outer try/except
                except Exception as e:
                    logger.error(f"Lobby {lobby_id}: Error updating DDB for hostStartsDraft: {str(e)}", exc_info=True)
                    raise # Re-raise

                # Broadcast the new state (draft is now active)
                final_last_action = draft_start_payload.get('lastAction')
                broadcast_lobby_state(lobby_id, apigw_management_client, last_action=final_last_action)
                
                return {'statusCode': 200, 'body': 'Draft started by host.'}
                # --- End of Step 1.6 Draft Initiation Logic ---

            except Exception as e:
                logger.error(f"Error processing hostStartsDraft for lobby {lobby_id}: {str(e)}", exc_info=True)
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Server error starting draft."})
                return {'statusCode': 500, 'body': 'Server error starting draft.'}
            
            # This return will be moved or changed once full logic is implemented
            # For now, just returning success. The actual DDB update and broadcast will happen inside the try.
            # The actual return for a successful draft start will be after broadcasting.
            # If validation fails in next steps, specific returns will be added.
            # For this step, we are just setting up the structure.
            return {'statusCode': 200, 'body': 'HostStartDraft action received.'}

        # --- ADD makeBan HANDLER ---
        elif action == 'makeBan':
            connection_id = event.get('requestContext', {}).get('connectionId')
            logger.info(f"--- Entered 'makeBan' action block --- Connection: {connection_id}")
            logger.info(f"DEBUG: 'makeBan' received message data: {message_data}")

            resonator_name = message_data.get('resonatorName')
            if not resonator_name:
                logger.error(f"'makeBan' request from {connection_id} missing 'resonatorName'.")
                return {'statusCode': 400, 'body': 'Missing resonatorName in request.'}
            logger.info(f"Received resonatorName: {resonator_name}")

            # Get lobby_id from connection_id
            try:
                connection_item = connections_table.get_item(Key={'connectionId': connection_id}).get('Item')
                if not connection_item or 'currentLobbyId' not in connection_item:
                    logger.warning(f"Connection {connection_id} not found or not in a lobby for makeBan.")
                    return {'statusCode': 404, 'body': 'Connection not associated with a lobby.'}
                lobby_id = connection_item['currentLobbyId']
                logger.info(f"Found lobbyId: {lobby_id} for connection {connection_id}")
            except Exception as e:
                logger.error(f"Failed to get connection details for {connection_id}: {str(e)}")
                return {'statusCode': 500, 'body': 'Error finding connection details.'}

            # Get lobby_item using ConsistentRead=True
            try:
                response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                lobby_item = response.get('Item')
                if not lobby_item:
                    logger.warning(f"Lobby {lobby_id} not found for makeBan.")
                    return {'statusCode': 404, 'body': 'Lobby data not found.'}
                logger.info(f"Fetched lobby_item for {lobby_id}. Current turn: {lobby_item.get('currentTurn')}")
            except Exception as e:
                logger.error(f"Failed to get lobby {lobby_id}: {str(e)}")
                return {'statusCode': 500, 'body': 'Error fetching lobby data.'}

            # Determine which player is making the action
            player_making_action = None
            if lobby_item.get('player1ConnectionId') == connection_id:
                player_making_action = 'P1'
            elif lobby_item.get('player2ConnectionId') == connection_id:
                player_making_action = 'P2'

            current_phase_from_db = lobby_item.get('currentPhase')
            
            # THIS IS THE CRITICAL NEW BRANCHING LOGIC:
            if current_phase_from_db == EQUILIBRATION_PHASE_NAME:
                logger.info(f"Processing Equilibration Ban for lobby {lobby_id} by {player_making_action}")
                
                # 1. Validation
                if player_making_action != lobby_item.get('currentTurn'):
                    logger.warning(f"Invalid equilibration ban attempt by {player_making_action} in lobby {lobby_id}")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Not your turn to make an equilibration ban."})
                    return {'statusCode': 400, 'body': 'Not your turn.'}

                if resonator_name not in lobby_item.get('availableResonators', []):
                    logger.warning(f"Invalid equilibration ban attempt for unavailable resonator {resonator_name} in lobby {lobby_id}")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Resonator {resonator_name} is not available."})
                    return {'statusCode': 400, 'body': 'Resonator not available.'}

                eq_bans_made = int(lobby_item.get('equilibrationBansMade', 0))
                eq_bans_allowed = int(lobby_item.get('equilibrationBansAllowed', 0))
                
                if eq_bans_made >= eq_bans_allowed:
                    logger.warning(f"Too many equilibration bans attempted in lobby {lobby_id}")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "No more equilibration bans allowed."})
                    return {'statusCode': 400, 'body': 'No more equilibration bans allowed.'}

                # 2. Process the ban
                eq_bans_made += 1
                new_available_list = [r for r in lobby_item.get('availableResonators', []) if r != resonator_name]
                
                # 3. If more EQ bans:
                if eq_bans_made < eq_bans_allowed:
                    # Log lobby state before update
                    logger.info(f"MAKE_ACTION_DEBUG (equilibrationBan): Lobby item BEFORE update for lobby {lobby_id}: {json.dumps(lobby_item, cls=DecimalEncoder)}")

                    # Update DDB with new ban and increment counter
                    try:
                        lobbies_table.update_item(
                            Key={'lobbyId': lobby_id},
                            UpdateExpression="""
                                SET bans = list_append(if_not_exists(bans, :empty_list), :new_ban),
                                    availableResonators = :new_available,
                                    equilibrationBansMade = :eq_bans_made,
                                    lastAction = :last_action
                            """,
                            ExpressionAttributeValues={
                                ':empty_list': [],
                                ':new_ban': [resonator_name],
                                ':new_available': new_available_list,
                                ':eq_bans_made': eq_bans_made,
                                ':last_action': f"{player_making_action} made equilibration ban {eq_bans_made} of {eq_bans_allowed}: {resonator_name}"
                            }
                        )
                        logger.info(f"Updated lobby {lobby_id} with equilibration ban {eq_bans_made} of {eq_bans_allowed}")
                        
                        # Immediately re-fetch and log to see what changed
                        refetched_item_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                        refetched_item = refetched_item_response.get('Item')
                        logger.info(f"MAKE_ACTION_DEBUG (equilibrationBan): Lobby item AFTER update (re-fetched) for lobby {lobby_id}: {json.dumps(refetched_item, cls=DecimalEncoder)}")
                        
                        # Broadcast the update
                        broadcast_lobby_state(lobby_id, apigw_management_client, f"{player_making_action} made equilibration ban {eq_bans_made} of {eq_bans_allowed}: {resonator_name}")
                        return {'statusCode': 200, 'body': 'Equilibration ban processed.'}
                    except Exception as e:
                        logger.error(f"Failed to update lobby {lobby_id} after equilibration ban: {str(e)}")
                        return {'statusCode': 500, 'body': 'Failed to process equilibration ban.'}
                
                # 4. Else (all EQ bans done - transition to standard draft):
                else:
                    # Get effective draft order and player roles
                    effective_draft_order = lobby_item.get('effectiveDraftOrder')
                    player_roles = lobby_item.get('playerRoles', {})
                    
                    if not effective_draft_order or not player_roles:
                        logger.error(f"Missing draft configuration for lobby {lobby_id}")
                        return {'statusCode': 500, 'body': 'Draft configuration missing.'}
                    
                    # Get first step of standard draft
                    first_step = effective_draft_order[0]
                    first_phase = first_step['phase']
                    first_turn_role = first_step['turnPlayerDesignation']
                    
                    # Resolve actual first turn
                    actual_first_turn = resolve_turn_from_role(first_turn_role, player_roles)
                    if not actual_first_turn:
                        logger.error(f"Failed to resolve first turn for lobby {lobby_id}")
                        return {'statusCode': 500, 'body': 'Failed to determine first turn.'}
                    
                    # Set standard turn timer
                    turn_expires_at_dt = datetime.now(timezone.utc) + timedelta(seconds=TURN_DURATION_SECONDS)
                    turn_expires_at_iso = turn_expires_at_dt.isoformat()
                    
                    # Update DDB for standard draft start
                    try:
                        lobbies_table.update_item(
                            Key={'lobbyId': lobby_id},
                            UpdateExpression="""
                                SET bans = list_append(if_not_exists(bans, :empty_list), :new_ban),
                                    availableResonators = :new_available,
                                    currentPhase = :next_phase,
                                    currentTurn = :next_turn,
                                    currentStepIndex = :next_index,
                                    turnExpiresAt = :expires,
                                    equilibrationBansMade = :eq_bans_made,
                                    lastAction = :last_action
                            """,
                            ExpressionAttributeValues={
                                ':empty_list': [],
                                ':new_ban': [resonator_name],
                                ':new_available': new_available_list,
                                ':next_phase': first_phase,
                                ':next_turn': actual_first_turn,
                                ':next_index': 0,
                                ':expires': turn_expires_at_iso,
                                ':eq_bans_made': eq_bans_made,
                                ':last_action': f"Equilibration bans complete. {player_making_action} made final ban: {resonator_name}. Starting standard draft."
                            }
                        )
                        logger.info(f"Updated lobby {lobby_id} to start standard draft after equilibration bans")
                        
                        # Immediately re-fetch and log to see what changed
                        refetched_item_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                        refetched_item = refetched_item_response.get('Item')
                        logger.info(f"MAKE_ACTION_DEBUG (equilibrationBanFinal): Lobby item AFTER update (re-fetched) for lobby {lobby_id}: {json.dumps(refetched_item, cls=DecimalEncoder)}")
                        
                        # Broadcast the update
                        broadcast_lobby_state(lobby_id, apigw_management_client, f"Equilibration bans complete. {player_making_action} made final ban: {resonator_name}. Starting standard draft.")
                        return {'statusCode': 200, 'body': 'Equilibration bans complete, draft starting.'}
                    except Exception as e:
                        logger.error(f"Failed to update lobby {lobby_id} for standard draft start: {str(e)}")
                        return {'statusCode': 500, 'body': 'Failed to start standard draft.'}

            else:
                # --- STANDARD BAN LOGIC ---
                logger.info(f"Processing Standard Ban for lobby {lobby_id} by {player_making_action} in phase {current_phase_from_db}")
                
                # Log lobby state at start of standard ban processing
                logger.info(f"STANDARD_BAN: lobby_item: {json.dumps(lobby_item, cls=DecimalEncoder)}")
                logger.info(f"STANDARD_BAN: Current phase: {lobby_item.get('currentPhase')}")
                logger.info(f"STANDARD_BAN: Current turn: {lobby_item.get('currentTurn')}")
                logger.info(f"STANDARD_BAN: Current step index: {lobby_item.get('currentStepIndex')}")
                logger.info(f"STANDARD_BAN: Effective draft order: {json.dumps(lobby_item.get('effectiveDraftOrder'), cls=DecimalEncoder)}")
                logger.info(f"STANDARD_BAN: Player roles: {json.dumps(lobby_item.get('playerRoles'), cls=DecimalEncoder)}")
                
                # Validate standard ban
                if lobby_item.get('lobbyState') != 'DRAFTING':
                    logger.warning(f"STANDARD_BAN: Invalid state {lobby_item.get('lobbyState')} for ban in lobby {lobby_id}")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Draft is not active."})
                    return {'statusCode': 400, 'body': 'Draft not active.'}

                if not current_phase_from_db.startswith('BAN'):
                    logger.warning(f"STANDARD_BAN: Invalid phase {current_phase_from_db} for ban in lobby {lobby_id}")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Cannot ban during phase: {current_phase_from_db}."})
                    return {'statusCode': 400, 'body': 'Not a banning phase.'}

                if player_making_action != lobby_item.get('currentTurn'):
                    logger.warning(f"STANDARD_BAN: Invalid turn - {player_making_action} tried to ban but it's {lobby_item.get('currentTurn')}'s turn")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Not your turn."})
                    return {'statusCode': 400, 'body': 'Not your turn.'}

                if resonator_name not in lobby_item.get('availableResonators', []):
                    logger.warning(f"STANDARD_BAN: Invalid resonator {resonator_name} - not in available list")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Resonator {resonator_name} is not available."})
                    return {'statusCode': 400, 'body': 'Resonator not available.'}

                # Get current step index and validate
                current_step_index = int(lobby_item.get('currentStepIndex', -1))
                logger.info(f"STANDARD_BAN: Current step index: {current_step_index}")
                
                if current_step_index < 0:
                    logger.error(f"STANDARD_BAN: Invalid step index {current_step_index}")
                    return {'statusCode': 500, 'body': 'Invalid draft step index.'}

                # Get effective draft order
                effective_draft_order = lobby_item.get('effectiveDraftOrder')
                if not effective_draft_order:
                    logger.error(f"STANDARD_BAN: Missing effectiveDraftOrder")
                    return {'statusCode': 500, 'body': 'Missing draft order configuration.'}

                # Calculate next state
                logger.info(f"STANDARD_BAN: Calling determine_next_state with index: {current_step_index}, order: {json.dumps(effective_draft_order, cls=DecimalEncoder)}")
                next_phase, next_turn_designation, next_step_index = determine_next_state(current_step_index, effective_draft_order)
                logger.info(f"STANDARD_BAN: Got from determine_next_state: phase={next_phase}, turn_des={next_turn_designation}, next_idx={next_step_index}")

                # Resolve next turn
                player_roles = lobby_item.get('playerRoles', {})
                logger.info(f"STANDARD_BAN: Calling resolve_turn_from_role with des: {next_turn_designation}, roles: {json.dumps(player_roles, cls=DecimalEncoder)}")
                actual_next_turn = resolve_turn_from_role(next_turn_designation, player_roles)
                logger.info(f"STANDARD_BAN: Got actual_next_turn: {actual_next_turn}")

                if not actual_next_turn:
                    logger.error(f"STANDARD_BAN: Failed to resolve next turn")
                    return {'statusCode': 500, 'body': 'Failed to determine next turn.'}

                # Prepare update
                new_available_list = [r for r in lobby_item.get('availableResonators', []) if r != resonator_name]
                turn_expires_at_dt = datetime.now(timezone.utc) + timedelta(seconds=TURN_DURATION_SECONDS)
                turn_expires_at_iso = turn_expires_at_dt.isoformat()

                update_expression = """
                    SET bans = list_append(if_not_exists(bans, :empty_list), :new_ban),
                        availableResonators = :new_available,
                        currentPhase = :next_phase,
                        currentTurn = :next_turn,
                        currentStepIndex = :next_index,
                        turnExpiresAt = :expires,
                        lastAction = :last_action
                """
                expression_values = {
                    ':empty_list': [],
                    ':new_ban': [resonator_name],
                    ':new_available': new_available_list,
                    ':next_phase': next_phase,
                    ':next_turn': actual_next_turn,
                    ':next_index': next_step_index,
                    ':expires': turn_expires_at_iso,
                    ':last_action': f"{player_making_action} banned {resonator_name}"
                }

                logger.info(f"STANDARD_BAN: Update payload:")
                logger.info(f"  UpdateExpression: {update_expression}")
                logger.info(f"  ExpressionAttributeValues: {json.dumps(expression_values, cls=DecimalEncoder)}")

                # Log lobby state before update
                logger.info(f"MAKE_ACTION_DEBUG (makeBan): Lobby item BEFORE update for lobby {lobby_id}: {json.dumps(lobby_item, cls=DecimalEncoder)}")

                try:
                    lobbies_table.update_item(
                        Key={'lobbyId': lobby_id},
                        UpdateExpression=update_expression,
                        ConditionExpression="currentStepIndex = :expected_index",
                        ExpressionAttributeValues={**expression_values, ':expected_index': current_step_index}
                    )
                    logger.info(f"STANDARD_BAN: Successfully updated lobby {lobby_id}")

                    # Immediately re-fetch and log to see what changed
                    refetched_item_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                    refetched_item = refetched_item_response.get('Item')
                    logger.info(f"MAKE_ACTION_DEBUG (makeBan): Lobby item AFTER update (re-fetched) for lobby {lobby_id}: {json.dumps(refetched_item, cls=DecimalEncoder)}")

                    # Broadcast the update
                    broadcast_lobby_state(lobby_id, apigw_management_client, f"{player_making_action} banned {resonator_name}")
                    return {'statusCode': 200, 'body': 'Standard ban processed.'}
                except ClientError as e:
                    if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                        logger.warning(f"STANDARD_BAN: Conditional check failed - state changed during update")
                        send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Action failed, state may have changed. Please wait for update."})
                        return {'statusCode': 409, 'body': 'Conflict, state changed during request.'}
                    else:
                        logger.error(f"STANDARD_BAN: Failed to update lobby: {str(e)}")
                        return {'statusCode': 500, 'body': 'Failed to update lobby state.'}
                except Exception as e:
                    logger.error(f"STANDARD_BAN: Unexpected error: {str(e)}")
                    return {'statusCode': 500, 'body': 'Internal server error during update.'}

        # --- ADD makePick HANDLER ---
        elif action == 'makePick':
            connection_id = event.get('requestContext', {}).get('connectionId')
            logger.info(f"--- !!! Entered 'makePick' action block !!! --- Connection: {connection_id}")
            logger.info(f"DEBUG: 'makePick' received message data: {message_data}")

            resonator_name = message_data.get('resonatorName')
            if not resonator_name:
                logger.error(f"'makePick' request from {connection_id} missing 'resonatorName'.")
                return {'statusCode': 400, 'body': 'Missing resonatorName in request.'}
            logger.info(f"Received resonatorName: {resonator_name}")
            lobby_id = None
            try:
                connection_item = connections_table.get_item(Key={'connectionId': connection_id}).get('Item')
                if not connection_item or 'currentLobbyId' not in connection_item:
                    logger.warning(f"Connection {connection_id} not found or not in a lobby for makePick.")
                    return {'statusCode': 404, 'body': 'Connection not associated with a lobby.'}
                lobby_id = connection_item['currentLobbyId']
                logger.info(f"Found lobbyId: {lobby_id} for connection {connection_id}")
            except Exception as e:
                 logger.error(f"Failed to get connection details for {connection_id}: {str(e)}")
                 return {'statusCode': 500, 'body': 'Error finding connection details.'}
            lobby_item = None
            if lobby_id:
                try:
                    # Use ConsistentRead for validation
                    response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                    lobby_item = response.get('Item')
                    if not lobby_item:
                        logger.warning(f"Lobby {lobby_id} not found for makePick.")
                        return {'statusCode': 404, 'body': 'Lobby data not found.'}
                    logger.info(f"Fetched lobby_item for {lobby_id}. Current turn: {lobby_item.get('currentTurn')}")
                except Exception as e:
                     logger.error(f"Failed to get lobby {lobby_id}: {str(e)}")
                     return {'statusCode': 500, 'body': 'Error fetching lobby data.'}
            else:
                 logger.error(f"Cannot fetch lobby item because lobby_id is missing for connection {connection_id}")
                 return {'statusCode': 500, 'body': 'Internal error: lobby_id missing.'}

            # --- Step 2: Validation (Keep uncommented) ---
            current_phase = lobby_item.get('currentPhase')
            current_turn = lobby_item.get('currentTurn')
            lobby_state = lobby_item.get('lobbyState')
            available_resonators = lobby_item.get('availableResonators', [])
            player1_conn_id = lobby_item.get('player1ConnectionId')
            player2_conn_id = lobby_item.get('player2ConnectionId')

            # a) Check if drafting is in progress
            if lobby_state != 'DRAFTING':
                logger.warning(f"Pick attempt in lobby {lobby_id} which is not in DRAFTING state ({lobby_state}).")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Draft is not active."})
                return {'statusCode': 400, 'body': 'Draft not active.'}

            # b) Check if it's a PICKING phase
            if not current_phase or not current_phase.startswith('PICK'):
                logger.warning(f"Pick attempt in lobby {lobby_id} during non-pick phase ({current_phase}).")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Cannot pick during phase: {current_phase}."})
                return {'statusCode': 400, 'body': 'Not a picking phase.'}

            # c) Check if it's the sender's turn
            player_making_pick = None
            if connection_id == player1_conn_id:
                player_making_pick = 'P1'
            elif connection_id == player2_conn_id:
                player_making_pick = 'P2'

            if player_making_pick != current_turn:
                logger.warning(f"Pick attempt in lobby {lobby_id} by {player_making_pick} ({connection_id}) but it's {current_turn}'s turn.")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Not your turn."})
                return {'statusCode': 400, 'body': 'Not your turn.'}

            # d) Check if the resonator is available
            if resonator_name not in available_resonators:
                logger.warning(f"Pick attempt in lobby {lobby_id} for unavailable resonator '{resonator_name}'. Available: {available_resonators}")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Resonator '{resonator_name}' is not available."})
                return {'statusCode': 400, 'body': 'Resonator not available.'}

            # --- Validation Passed ---
            logger.info(f"Validation passed for pick of '{resonator_name}' by {current_turn} in lobby {lobby_id}, phase {current_phase}.")
            # --- End of Step 2 ---

            # 5. *** Calculate Next State using Index ***
            current_step_index_decimal = lobby_item.get('currentStepIndex', -1) # Get value which might be Decimal

            # --- ADD INT CONVERSION AND CHECK ---
            try:
                # Convert the retrieved value (Decimal or -1) to an integer
                current_step_index = int(current_step_index_decimal)
                # Check if conversion resulted in -1 unexpectedly (handles edge cases)
                if current_step_index == -1 and current_step_index_decimal != -1:
                     raise ValueError("Invalid step index (-1) after conversion.")
            except (TypeError, ValueError) as e:
                 # Log error if conversion fails or value is invalid
                 logger.error(f"Invalid currentStepIndex '{current_step_index_decimal}' retrieved from lobby {lobby_id} during pick. Error: {e}")
                 return {'statusCode': 500, 'body': 'Internal error: Invalid draft step index.'}
            # --- END ADDITION ---

            # Check if index is valid before proceeding (it might be -1 if draft never initialized index)
            if current_step_index < 0: # Check less than 0 to catch default -1
                 logger.error(f"Cannot determine next state for lobby {lobby_id}: currentStepIndex is invalid ({current_step_index}).")
                 return {'statusCode': 500, 'body': 'Internal error: Invalid draft step index state.'}

            # Now call determine_next_state with the guaranteed integer index
            effective_draft_order = lobby_item.get('effectiveDraftOrder')
            if not effective_draft_order:
                logger.error(f"Lobby {lobby_id} missing effectiveDraftOrder during pick.")
                return {'statusCode': 500, 'body': 'Internal error: Missing draft order configuration.'}
            
            # 1. Determine next state from draft order
            next_phase, next_turn_designation, next_step_index = determine_next_state(current_step_index, effective_draft_order)

            # 2. Resolve the actual player for the next turn
            player_roles = lobby_item.get('playerRoles', {})
            actual_next_turn = None  # Initialize to None
            
            if next_turn_designation:  # Only attempt to resolve if there is a designation
                if 'P1_ROLE_IN_TEMPLATE' in player_roles:  # P1_FAVORED_DRAFT_ORDER was chosen
                    if next_turn_designation == 'P1_ROLE':
                        actual_next_turn = player_roles['P1_ROLE_IN_TEMPLATE']
                    elif next_turn_designation == 'P2_ROLE':
                        actual_next_turn = player_roles['P2_ROLE_IN_TEMPLATE']
                elif 'ROLE_A' in player_roles:  # NEUTRAL_DRAFT_ORDER_TEMPLATE_V2 was chosen
                    if next_turn_designation == 'ROLE_A':
                        actual_next_turn = player_roles['ROLE_A']
                    elif next_turn_designation == 'ROLE_B':
                        actual_next_turn = player_roles['ROLE_B']
                
                # Log if resolution failed but a designation was expected
                if not actual_next_turn:
                    logger.warning(f"Lobby {lobby_id}: Could not resolve actual_next_turn from designation '{next_turn_designation}' and roles {player_roles}. This is expected if draft is completing.")

            # If draft is complete, next turn should be None
            if next_phase == 'DRAFT_COMPLETE':
                actual_next_turn = None
                logger.info(f"Lobby {lobby_id}: Draft is now complete. Next turn is None.")

            # 3. Now it's safe to log these resolved values
            logger.info(f"MAKE_PICK_FINAL_STEP_DEBUG: Processing pick: {resonator_name} by {current_turn}")
            logger.info(f"MAKE_PICK_FINAL_STEP_DEBUG: Next state determined: Phase='{next_phase}', TurnDes='{next_turn_designation}', Index='{next_step_index}'")
            logger.info(f"MAKE_PICK_FINAL_STEP_DEBUG: Actual next turn resolved to: {actual_next_turn}")

            # 4. Prepare payload for DynamoDB update
            try:
                new_available_list = [res for res in available_resonators if res != resonator_name]

                # --- Calculate expiry for the NEXT turn ---
                turn_expires_at_iso = None
                if actual_next_turn:  # Only set expiry if there is a next turn
                    now = datetime.now(timezone.utc)
                    expires_at_dt = now + timedelta(seconds=TURN_DURATION_SECONDS)
                    turn_expires_at_iso = expires_at_dt.isoformat()
                logger.info(f"Setting next turn expiry for lobby {lobby_id} to: {turn_expires_at_iso}")
                # --- End Calculation ---

                # Determine which player's pick list to update
                update_expression_string = ""
                expression_attribute_values_dict = {}
                player_pick_list_key = ""

                if current_turn == 'P1':
                    player_pick_list_key = ":new_pick_p1"
                    update_expression_string = """
                        SET player1Picks = list_append(if_not_exists(player1Picks, :empty_list), :new_pick_p1),
                            availableResonators = :new_available,
                            currentPhase = :next_phase,
                            currentTurn = :next_turn,
                            currentStepIndex = :next_index,
                            turnExpiresAt = :expires,
                            lastAction = :last_action_val 
                    """
                    expression_attribute_values_dict = {
                        ':empty_list': [],
                        ':new_pick_p1': [resonator_name],
                        ':new_available': new_available_list,
                        ':next_phase': next_phase,
                        ':next_turn': actual_next_turn,
                        ':next_index': next_step_index,
                        ':expected_index': current_step_index,
                        ':expires': turn_expires_at_iso,
                        ':last_action_val': f'{current_turn} picked {resonator_name}'
                    }
                elif current_turn == 'P2':
                    player_pick_list_key = ":new_pick_p2"
                    update_expression_string = """
                        SET player2Picks = list_append(if_not_exists(player2Picks, :empty_list), :new_pick_p2),
                            availableResonators = :new_available,
                            currentPhase = :next_phase,
                            currentTurn = :next_turn,
                            currentStepIndex = :next_index,
                            turnExpiresAt = :expires,
                            lastAction = :last_action_val 
                    """
                    expression_attribute_values_dict = {
                        ':empty_list': [],
                        ':new_pick_p2': [resonator_name],
                        ':new_available': new_available_list,
                        ':next_phase': next_phase,
                        ':next_turn': actual_next_turn,
                        ':next_index': next_step_index,
                        ':expected_index': current_step_index,
                        ':expires': turn_expires_at_iso,
                        ':last_action_val': f'{current_turn} picked {resonator_name}'
                    }
                else:
                    # Should not happen if validation passed, but handle defensively
                    logger.error(f"Cannot update picks for invalid turn '{current_turn}' in lobby {lobby_id}")
                    return {'statusCode': 500, 'body': f"Internal error: Invalid turn {current_turn} during pick update."}

                condition_expression_string = "currentStepIndex = :expected_index"

                # --- ADD LOGGING HERE ---
                logger.info(f"UpdateItem Params for lobby {lobby_id} (pick for {current_turn}):")
                logger.info(f"  UpdateExpression: {update_expression_string}")
                logger.info(f"  ConditionExpression: {condition_expression_string}")
                logger.info(f"  ExpressionAttributeValues: {json.dumps(expression_attribute_values_dict, cls=DecimalEncoder, indent=2)}")
                # --- END LOGGING ---

            except ClientError as e:
                if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                    logger.warning(f"Conditional check failed for pick update in lobby {lobby_id}. State likely changed. Index={current_step_index}")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Action failed, state may have changed. Please wait for update."})
                    return {'statusCode': 409, 'body': 'Conflict, state changed during request.'}
                else:
                    logger.error(f"Failed to update lobby {lobby_id} after pick: {str(e)}")
                    return {'statusCode': 500, 'body': 'Failed to update lobby state.'}
            except Exception as e:
                 logger.error(f"Unexpected error updating lobby {lobby_id} after pick: {str(e)}")
                 return {'statusCode': 500, 'body': 'Internal server error during update.'}
            
            try:
                logger.info(f"Attempting to update lobby {lobby_id} state in DynamoDB for {current_turn} pick (using index).")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression_string,
                    ConditionExpression=condition_expression_string,
                    ExpressionAttributeValues=expression_attribute_values_dict
                )

                # Immediately re-fetch and log to see what changed
                refetched_item_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                refetched_item = refetched_item_response.get('Item')
                logger.info(f"MAKE_ACTION_DEBUG (makePick): Lobby item AFTER update (re-fetched) for lobby {lobby_id}: {json.dumps(refetched_item, cls=DecimalEncoder)}")


                # --- End of Step 3 ---

                last_action_for_broadcast = f'{current_turn} picked {resonator_name}'
                logger.info(f"MAKE_PICK_DEBUG: Calling centralized broadcast_lobby_state for lobby {lobby_id}. Last Action: '{last_action_for_broadcast}'")
                    
                # apigw_management_client is the client object initialized at the start of your main Lambda handler
                broadcast_success = broadcast_lobby_state(lobby_id, apigw_management_client, last_action_for_broadcast) 
                    
                if broadcast_success:
                    logger.info(f"MAKE_PICK_DEBUG: Centralized broadcast after pick successful for lobby {lobby_id}.")
                else:
                    logger.warning(f"MAKE_PICK_DEBUG: Centralized broadcast after pick may have encountered issues for lobby {lobby_id} (check broadcast_lobby_state logs).")
                    # --- END OF REPLACEMENT ---
            
            except ClientError as e:
                if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                        logger.warning(f"Conditional check failed for pick update in lobby {lobby_id}. State likely changed. Index={current_step_index}")
                        send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Action failed, state may have changed. Please wait for update."})
                        return {'statusCode': 409, 'body': 'Conflict, state changed during request.'}
                else:
                    logger.error(f"MAKE_PICK_ERROR: ClientError updating DDB for lobby {lobby_id}: {str(e)}", exc_info=True)
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Failed to record pick."}) # Send error to client
                    return {'statusCode': 500, 'body': 'Failed to process pick due to database error.'}
            except Exception as e:
                logger.error(f"MAKE_PICK_ERROR: Unexpected error for lobby {lobby_id}: {str(e)}", exc_info=True)
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Server error processing pick."}) # Send error to client
                return {'statusCode': 500, 'body': 'Internal server error processing pick.'}

            return {'statusCode': 200, 'body': 'Pick processed successfully.'}

        # --- ADD TIMEOUT HANDLER ---
        elif action == 'turnTimeout':
            logger.info(f"--- Entered 'turnTimeout' action block ---")
            connection_id = event.get('requestContext', {}).get('connectionId') # ID of client whose timer expired

            # Get expected state from client message
            expected_phase = message_data.get('expectedPhase')
            expected_turn = message_data.get('expectedTurn')
            if not expected_phase or not expected_turn:
                 logger.warning(f"Timeout message from {connection_id} missing expected phase/turn.")
                 return {'statusCode': 400, 'body': 'Missing expected state in timeout request.'}

            # 1. Find lobby for the connection
            lobby_id = None
            try:
                connection_item = connections_table.get_item(Key={'connectionId': connection_id}).get('Item')
                if connection_item and 'currentLobbyId' in connection_item:
                    lobby_id = connection_item['currentLobbyId']
                else: # Should not happen if player is in draft, but handle defensively
                     logger.warning(f"Connection {connection_id} reporting timeout not found or not in lobby.")
                     return {'statusCode': 404, 'body': 'Connection not associated with a lobby.'}
                logger.info(f"Found lobbyId: {lobby_id} for timeout request from {connection_id}")
            except Exception as e:
                 logger.error(f"Failed to get connection details for {connection_id}: {str(e)}")
                 return {'statusCode': 500, 'body': 'Error finding connection details.'}

            # 2. Get CURRENT lobby state from DB
            lobby_item = None
            if lobby_id:
                try:
                    response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                    lobby_item = response.get('Item')
                    if not lobby_item:
                        logger.warning(f"Lobby {lobby_id} not found for timeout processing.")
                        return {'statusCode': 404, 'body': 'Lobby data not found.'}
                    logger.info(f"Fetched current lobby state for {lobby_id} to process timeout.")
                    # --- ADD DEBUG LOGGING HERE ---
                    logger.info(f"DEBUG: Fetched lobby state for timeout check. DB Phase: {lobby_item.get('currentPhase')}, DB Turn: {lobby_item.get('currentTurn')}, DB Index: {lobby_item.get('currentStepIndex')}, DB Expires: {lobby_item.get('turnExpiresAt')}")
                    # --- END DEBUG LOGGING ---
                except Exception as e:
                     logger.error(f"Failed to get lobby {lobby_id} for timeout: {str(e)}")
                     return {'statusCode': 500, 'body': 'Error fetching lobby data.'}
            else: # Should be caught above
                return {'statusCode': 500, 'body': 'Internal error: lobby_id missing.'}

            # 3. *** Timeout Validation ***
            current_phase_db = lobby_item.get('currentPhase')
            current_turn_db = lobby_item.get('currentTurn')
            current_step_index_decimal = lobby_item.get('currentStepIndex', -1)
            turn_expires_at_db = lobby_item.get('turnExpiresAt')
            logger.info(f"DEBUG: Timeout Check: Expected={expected_phase}/{expected_turn}, DB={current_phase_db}/{current_turn_db}, Expires={turn_expires_at_db}")

            # --- UNCOMMENT THIS CHECK ---
            # a) Check if the turn reported by client matches the DB
            if current_phase_db != expected_phase or current_turn_db != expected_turn:
                logger.info(f"Timeout ignored for lobby {lobby_id}. Client expected {expected_phase}/{expected_turn} but DB state is {current_phase_db}/{current_turn_db}. Player likely acted or race condition occurred previously.")
                return {'statusCode': 200, 'body': 'Timeout ignored, state already advanced.'}
            # --- END UNCOMMENT ---

            # --- CORRECT THIS CHECK ---
            # b) Check if the expiry time has actually passed
            now = datetime.now(timezone.utc)
            if not turn_expires_at_db:
                 logger.warning(f"Timeout processing failed for lobby {lobby_id}. Missing turnExpiresAt attribute.")
                 return {'statusCode': 500, 'body': 'Internal error: Missing expiry data.'}
            
            try:
                # Parse the expiry time string to datetime object
                expires_at = datetime.fromisoformat(turn_expires_at_db.replace('Z', '+00:00'))
                # Add a 2-second grace period to account for network delays and timing differences
                grace_period = timedelta(seconds=3)
                if now < expires_at - grace_period: # Only reject if we're well before the expiry
                    logger.warning(f"Timeout check failed for lobby {lobby_id}. Expiry {turn_expires_at_db} has not passed yet ({now.isoformat()}). Client timer might be fast or message delayed.")
                    return {'statusCode': 400, 'body': 'Timeout condition not met (time has not passed).'}
            except ValueError as e:
                logger.error(f"Error parsing expiry time for lobby {lobby_id}: {str(e)}")
                return {'statusCode': 500, 'body': 'Internal error: Invalid expiry time format.'}
            
            # If we reach here, time HAS passed or is within grace period
            logger.info(f"Timeout time condition met for lobby {lobby_id}. Expiry: {turn_expires_at_db}, Current: {now.isoformat()}.")
            # --- END CORRECTION ---

            # c) Convert and check index (Keep fix from Response #87)
            current_step_index = None # Initialize
            try:
                current_step_index = int(current_step_index_decimal)
                if current_step_index == -1 and current_step_index_decimal != -1: raise ValueError("Invalid step index (-1)")
            except (TypeError, ValueError) as e:
                  logger.error(f"Invalid currentStepIndex '{current_step_index_decimal}' ... Error: {e}")
                  return {'statusCode': 500, 'body': 'Internal error: Invalid draft step index.'}

            if current_phase_db == DRAFT_COMPLETE_PHASE or current_step_index is None or current_step_index < 0:
                 logger.warning(f"Timeout ignored for lobby {lobby_id}. Draft already complete or index invalid ({current_step_index}).")
                 return {'statusCode': 200, 'body': 'Timeout ignored, draft finished or invalid state.'}

            # --- REMOVE SPECIAL CHECK FOR FIRST TURN ---
            # if current_step_index == 0 and current_phase_db == 'BAN1' and current_turn_db == 'P1':
            #     logger.info(f"Timeout ignored for lobby {lobby_id}. First turn (BAN1 P1) cannot be automatically passed.")
            #     return {'statusCode': 200, 'body': 'Timeout ignored, first turn cannot be automatically passed.'}
            # --- END REMOVE SPECIAL CHECK ---

            logger.info(f"Timeout validated for lobby {lobby_id}. Player {current_turn_db} timed out during phase {current_phase_db} at step {current_step_index}.")

            # 4. *** Perform Random Action ***
            timed_out_player = current_turn_db # The player who failed to act
            available_resonators = lobby_item.get('availableResonators', [])
            if not available_resonators:
                logger.error(f"Timeout action failed for lobby {lobby_id}: No available resonators.")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Timeout occurred, but no characters available."})
                return {'statusCode': 500, 'body': 'Internal error: No characters available on timeout.'}

            random_choice = random.choice(available_resonators)
            is_ban_phase = current_phase_db.startswith('BAN')
            action_taken = "banned" if is_ban_phase else "picked"
            logger.info(f"Timeout action for {timed_out_player} in lobby {lobby_id}: Randomly {action_taken} '{random_choice}'.")

            # 5. *** Calculate Next State ***
            effective_draft_order = lobby_item.get('effectiveDraftOrder')
            if not effective_draft_order:
                logger.error(f"Lobby {lobby_id} missing effectiveDraftOrder during timeout.")
                return {'statusCode': 500, 'body': 'Internal error: Missing draft order configuration.'}
            next_phase, next_turn_designation, next_step_index = determine_next_state(current_step_index, effective_draft_order)

            # Resolve the actual player turn based on playerRoles and the role from the template
            player_roles = lobby_item.get('playerRoles', {})
            actual_next_turn = None
            if 'P1_ROLE_IN_TEMPLATE' in player_roles: # P1_FAVORED_DRAFT_ORDER was chosen
                if next_turn_designation == 'P1_ROLE':
                    actual_next_turn = player_roles['P1_ROLE_IN_TEMPLATE']
                elif next_turn_designation == 'P2_ROLE':
                    actual_next_turn = player_roles['P2_ROLE_IN_TEMPLATE']
            elif 'ROLE_A' in player_roles: # NEUTRAL_DRAFT_ORDER_TEMPLATE_V2 was chosen
                if next_turn_designation == 'ROLE_A':
                    actual_next_turn = player_roles['ROLE_A']
                elif next_turn_designation == 'ROLE_B':
                    actual_next_turn = player_roles['ROLE_B']
            
            if not actual_next_turn:
                logger.error(f"Lobby {lobby_id}: Could not resolve actual next turn from designation '{next_turn_designation}' and roles {player_roles}. Defaulting to P1.")
                actual_next_turn = 'P1' # Fallback, should not happen

            # 6. *** Update DynamoDB ***
            try:
                new_available_list = [res for res in available_resonators if res != random_choice]
                turn_expires_at_iso = None # Calculate expiry for the NEW turn
                if actual_next_turn:
                    now = datetime.now(timezone.utc)
                    expires_at_dt = now + timedelta(seconds=TURN_DURATION_SECONDS)
                    turn_expires_at_iso = expires_at_dt.isoformat()
                logger.info(f"Setting next turn expiry (after timeout) for lobby {lobby_id} to: {turn_expires_at_iso}")

                # Log lobby state before update
                logger.info(f"TIMEOUT_HANDLER_DEBUG: Lobby item BEFORE update for lobby {lobby_id}: {json.dumps(lobby_item, cls=DecimalEncoder)}")

                update_expression = ""
                expression_attribute_values = {}

                base_update = """
                    SET availableResonators = :new_available,
                        currentPhase = :next_phase,
                        currentTurn = :next_turn,
                        currentStepIndex = :next_index,
                        turnExpiresAt = :expires,
                        lastAction = :last_action
                """
                last_action = f'{timed_out_player} timed out, randomly {action_taken} {random_choice}'
                base_values = {
                    ':new_available': new_available_list,
                    ':next_phase': next_phase,
                    ':next_turn': actual_next_turn,
                    ':next_index': next_step_index,
                    ':expires': turn_expires_at_iso,
                    ':expected_index': current_step_index, # Use the int version here
                    ':last_action': last_action
                }

                if is_ban_phase:
                    update_expression = base_update + ", bans = list_append(if_not_exists(bans, :empty_list), :new_ban)"
                    expression_attribute_values = {**base_values, ':empty_list': [], ':new_ban': [random_choice]}
                elif timed_out_player == 'P1':
                    update_expression = base_update + ", player1Picks = list_append(if_not_exists(player1Picks, :empty_list), :new_pick)"
                    expression_attribute_values = {**base_values, ':empty_list': [], ':new_pick': [random_choice]}
                elif timed_out_player == 'P2':
                    update_expression = base_update + ", player2Picks = list_append(if_not_exists(player2Picks, :empty_list), :new_pick)"
                    expression_attribute_values = {**base_values, ':empty_list': [], ':new_pick': [random_choice]}
                else: # Should not happen
                     raise ValueError(f"Invalid timed_out_player: {timed_out_player}")

                logger.info(f"TIMEOUT_HANDLER_DEBUG: Attempting to update lobby {lobby_id} state after timeout.")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression,
                    ConditionExpression="currentStepIndex = :expected_index", # Check against expected int index
                    ExpressionAttributeValues=expression_attribute_values
                )
                logger.info(f"TIMEOUT_HANDLER_DEBUG: Successfully updated lobby {lobby_id} state after timeout.")

                # Immediately re-fetch and log to see what changed
                refetched_item_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                refetched_item = refetched_item_response.get('Item')
                logger.info(f"TIMEOUT_HANDLER_DEBUG: Lobby item AFTER update (re-fetched) for lobby {lobby_id}: {json.dumps(refetched_item, cls=DecimalEncoder)}")

                # Call centralized broadcast function
                logger.info(f"TIMEOUT_HANDLER_DEBUG: Calling centralized broadcast_lobby_state for lobby {lobby_id}. Last Action: '{last_action}'")
                broadcast_success = broadcast_lobby_state(lobby_id, apigw_management_client, last_action)
                
                if broadcast_success:
                    logger.info(f"TIMEOUT_HANDLER_DEBUG: Centralized broadcast after timeout successful for lobby {lobby_id}.")
                else:
                    logger.warning(f"TIMEOUT_HANDLER_DEBUG: Centralized broadcast after timeout may have encountered issues for lobby {lobby_id}.")

            except ClientError as e:
                if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                    logger.warning(f"Conditional check failed for lobby {lobby_id} during timeout update. State may have changed.")
                    return {'statusCode': 409, 'body': 'State changed during timeout processing.'}
                else:
                    logger.error(f"Failed to update lobby {lobby_id} after timeout (ClientError): {str(e)}", exc_info=True)
                    return {'statusCode': 500, 'body': 'Failed to update lobby state after timeout.'}
            except Exception as e:
                 logger.error(f"Unexpected error updating/broadcasting lobby {lobby_id} after timeout: {str(e)}", exc_info=True)
                 return {'statusCode': 500, 'body': 'Internal server error during timeout update.'}

            return {'statusCode': 200, 'body': 'Timeout processed successfully.'}

        # --- END TIMEOUT HANDLER ---

        elif action == 'ping':
            # API Gateway idle timeout resets upon receiving a message.
            # No action needed usually, but we can log it or send pong.
            logger.info(f"Received ping from {connection_id}")
            # Optional: Send pong back
            # send_message_to_client(apigw_management_client, connection_id, {"type": "pong"})
            return {'statusCode': 200, 'body': 'Pong.'}
        # --- END PING HANDLER ---

        # --- NEW: leaveLobby Handler ---
        elif action == 'leaveLobby':
            logger.info(f"Processing 'leaveLobby' for connection {connection_id}")
            lobby_id = message_data.get('lobbyId') # Client should send lobbyId
            if not lobby_id:
                 logger.warning(f"leaveLobby request from {connection_id} missing lobbyId.")
                 # No need to send error, client is leaving anyway
                 return {'statusCode': 400, 'body': 'Missing lobbyId.'}

            try:
                # Get lobby state
                # Use ConsistentRead=True to get latest state before modifying
                response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                lobby_item = response.get('Item')
                if not lobby_item:
                    logger.warning(f"Lobby {lobby_id} not found for leaving connection {connection_id}.")
                    # If lobby not found, maybe just try cleaning up connection table?
                    try:
                        connections_table.update_item(Key={'connectionId': connection_id}, UpdateExpression="REMOVE currentLobbyId")
                        logger.info(f"Cleaned up connection {connection_id} for non-existent lobby {lobby_id}.")
                    except Exception as conn_clean_err:
                         logger.error(f"Failed to cleanup connection {connection_id} for non-existent lobby {lobby_id}: {conn_clean_err}")
                    return {'statusCode': 404, 'body': 'Lobby not found.'}

                current_lobby_state = lobby_item.get('lobbyState', 'UNKNOWN')
                player1_conn_id = lobby_item.get('player1ConnectionId')
                player2_conn_id = lobby_item.get('player2ConnectionId')
                host_conn_id = lobby_item.get('hostConnectionId') # Needed for broadcast exclusion

                leaving_player_slot = None
                leaving_player_name = "Unknown Player"
                update_expressions = [] # Use list for expressions
                remove_expressions = [] # Use list for REMOVE expressions
                expression_values = {}
                expression_names = {} # Add for attribute name placeholders
                last_action_msg = None

                # Determine which slot is leaving
                if connection_id == player1_conn_id:
                    leaving_player_slot = 'P1'
                    leaving_player_name = lobby_item.get('player1Name', 'Player 1')
                    # Define placeholders and actual names for P1
                    p_conn_id_ph = '#p1cid'
                    p_name_ph = '#p1n'
                    p_ready_ph = '#p1r'
                    p_seq_ph = '#p1seq'
                    p_score_ph = '#p1wbs'
                    p_submitted_ph = '#p1ss'
                    
                    # Map placeholders to actual attribute names
                    expression_names.update({
                        p_conn_id_ph: 'player1ConnectionId',
                        p_name_ph: 'player1Name',
                        p_ready_ph: 'player1Ready',
                        p_seq_ph: 'player1Sequences',
                        p_score_ph: 'player1WeightedBoxScore',
                        p_submitted_ph: 'player1ScoreSubmitted'
                    })
                    
                    # Add to remove expressions using placeholders
                    remove_expressions.extend([p_conn_id_ph, p_name_ph, p_seq_ph, p_score_ph])
                    # Add to set expressions using placeholders
                    update_expressions.extend([
                        f"{p_ready_ph} = :falseVal",
                        f"{p_submitted_ph} = :falseVal"
                    ])
                    
                elif connection_id == player2_conn_id:
                    leaving_player_slot = 'P2'
                    leaving_player_name = lobby_item.get('player2Name', 'Player 2')
                    # Define placeholders and actual names for P2
                    p_conn_id_ph = '#p2cid'
                    p_name_ph = '#p2n'
                    p_ready_ph = '#p2r'
                    p_seq_ph = '#p2seq'
                    p_score_ph = '#p2wbs'
                    p_submitted_ph = '#p2ss'
                    
                    # Map placeholders to actual attribute names
                    expression_names.update({
                        p_conn_id_ph: 'player2ConnectionId',
                        p_name_ph: 'player2Name',
                        p_ready_ph: 'player2Ready',
                        p_seq_ph: 'player2Sequences',
                        p_score_ph: 'player2WeightedBoxScore',
                        p_submitted_ph: 'player2ScoreSubmitted'
                    })
                    
                    # Add to remove expressions using placeholders
                    remove_expressions.extend([p_conn_id_ph, p_name_ph, p_seq_ph, p_score_ph])
                    # Add to set expressions using placeholders
                    update_expressions.extend([
                        f"{p_ready_ph} = :falseVal",
                        f"{p_submitted_ph} = :falseVal"
                    ])
                else:
                    logger.warning(f"Connection {connection_id} tried to leave lobby {lobby_id} but is not P1 or P2.")
                    # Handle host leaving later in disconnect handler if needed
                    return {'statusCode': 200, 'body': 'Leave ignored (not P1 or P2).'}

                # Reset logic based on lobby state
                if current_lobby_state == 'DRAFTING':
                    logger.info(f"Player {leaving_player_slot} leaving mid-draft. Resetting lobby {lobby_id} to WAITING.")
                    last_action_msg = f"{leaving_player_name} left during the draft."
                    update_expressions.extend([
                        "lobbyState = :waitState",
                        "lastAction = :lastAct"
                    ])
                    remove_expressions.extend([ # Remove all draft-specific fields
                        "currentPhase", "currentTurn", "currentStepIndex",
                        "turnExpiresAt", "bans", "player1Picks",
                        "player2Picks", "availableResonators",
                        "effectiveDraftOrder", "playerRoles",
                        "equilibrationBansAllowed", "equilibrationBansMade", "currentEquilibrationBanner"
                    ])
                    expression_values[':waitState'] = 'WAITING'
                    expression_values[':lastAct'] = last_action_msg
                elif current_lobby_state == 'WAITING':
                     logger.info(f"Player {leaving_player_slot} leaving in WAITING state.")
                     last_action_msg = f"{leaving_player_name} left the lobby."
                     update_expressions.append("lastAction = :lastAct")
                     expression_values[':lastAct'] = last_action_msg
                else: # E.g., DRAFT_COMPLETE or UNKNOWN
                     logger.warning(f"Player {leaving_player_slot} leaving from state {current_lobby_state}")
                     last_action_msg = f"{leaving_player_name} left."
                     update_expressions.append("lastAction = :lastAct")
                     expression_values[':lastAct'] = last_action_msg

                # Add false value for ready/submitted flags
                expression_values[':falseVal'] = False

                # Construct final UpdateExpression
                final_update_expr = ""
                if update_expressions:
                    final_update_expr += "SET " + ", ".join(update_expressions)
                if remove_expressions:
                    if final_update_expr: final_update_expr += " " # Add space if SET exists
                    final_update_expr += "REMOVE " + ", ".join(remove_expressions)

                # Log the update details for debugging
                logger.info(f"Updating lobby {lobby_id} for player leave:")
                logger.info(f"Update Expression: {final_update_expr}")
                logger.info(f"Expression Attribute Names: {expression_names}")
                logger.info(f"Expression Attribute Values: {expression_values}")

                # Perform the update
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=final_update_expr,
                    ExpressionAttributeNames=expression_names,
                    ExpressionAttributeValues=expression_values
                )
                logger.info(f"Lobby {lobby_id} updated for player leave.")

                # Remove currentLobbyId from connection
                try:
                    connections_table.update_item(Key={'connectionId': connection_id}, UpdateExpression="REMOVE currentLobbyId")
                except Exception as conn_clean_err:
                    logger.error(f"Failed to cleanup connection {connection_id} after leave: {conn_clean_err}")

                # Broadcast updated state
                broadcast_lobby_state(lobby_id, apigw_management_client, last_action=last_action_msg, exclude_connection_id=connection_id)

                return {'statusCode': 200, 'body': 'Player left lobby.'}

            except Exception as e:
                logger.error(f"Error processing leaveLobby for {connection_id} on lobby {lobby_id}: {str(e)}", exc_info=True)
                return {'statusCode': 500, 'body': 'Failed to leave lobby.'}
        # --- END leaveLobby Handler ---

        # --- NEW: deleteLobby Handler ---
        elif action == 'deleteLobby':
             logger.info(f"Processing 'deleteLobby' for connection {connection_id}")
             lobby_id = message_data.get('lobbyId')
             if not lobby_id:
                 logger.warning(f"deleteLobby request from {connection_id} missing lobbyId.")
                 send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Lobby ID missing."})
                 return {'statusCode': 400, 'body': 'Missing lobbyId.'}

             try:
                 # Get lobby to verify host and find participants
                 # Use ConsistentRead=True to prevent deleting based on stale data
                 response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                 lobby_item = response.get('Item')
                 if not lobby_item:
                     logger.warning(f"Lobby {lobby_id} not found for deletion attempt by {connection_id}.")
                     send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Lobby already deleted or not found."})
                     return {'statusCode': 404, 'body': 'Lobby not found.'}

                 # Verify requester is the host
                 host_connection_id = lobby_item.get('hostConnectionId')
                 if connection_id != host_connection_id:
                     logger.warning(f"Unauthorized delete attempt on lobby {lobby_id} by {connection_id} (Host is {host_connection_id}).")
                     send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Only the host can delete the lobby."})
                     return {'statusCode': 403, 'body': 'Forbidden: Not the host.'}

                 # Find participants BEFORE deleting lobby
                 participants = [
                     lobby_item.get('hostConnectionId'),
                     lobby_item.get('player1ConnectionId'),
                     lobby_item.get('player2ConnectionId')
                 ]
                 valid_connection_ids = [pid for pid in participants if pid]

                 # Delete the lobby item
                 logger.info(f"Host {connection_id} deleting lobby {lobby_id}.")
                 lobbies_table.delete_item(Key={'lobbyId': lobby_id})
                 logger.info(f"Lobby {lobby_id} deleted successfully.")

                 # --- CORRECTED NOTIFICATION LOGIC ---
                 # Notify ALL participants (including host) and cleanup connections table
                 force_redirect_payload = {
                     "type": "forceRedirect",
                     "reason": "deleted", # Use 'deleted' reason
                     "message": f"Lobby {lobby_id} was deleted by the host."
                 }
                 logger.info(f"Notifying participants and cleaning up connections for deleted lobby {lobby_id}. Participants: {valid_connection_ids}")
                 for pid in valid_connection_ids:
                     logger.info(f"Sending forceRedirect to {pid} and cleaning up connection.")
                     # Send redirect message first
                     send_message_to_client(apigw_management_client, pid, force_redirect_payload)

                     # Cleanup connection entry (best effort)
                     try:
                         connections_table.update_item(
                             Key={'connectionId': pid},
                             UpdateExpression="REMOVE currentLobbyId"
                             # Add ConditionExpression if needed, e.g., check if currentLobbyId still matches lobby_id
                         )
                         logger.info(f"Removed currentLobbyId from connection {pid}")
                     except Exception as conn_clean_err:
                         logger.error(f"Failed to cleanup connection {pid} after lobby deletion: {conn_clean_err}")
                 # --- END CORRECTED NOTIFICATION LOGIC ---

                 return {'statusCode': 200, 'body': 'Lobby deleted successfully.'}

             except Exception as e:
                 logger.error(f"Error processing deleteLobby for {connection_id} on lobby {lobby_id}: {str(e)}", exc_info=True)
                 # Avoid sending error if delete succeeded but notification failed
                 # Check if item still exists to determine error type? More complex.
                 # For now, send generic error to host.
                 send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Failed to delete lobby: {str(e)}"})
                 return {'statusCode': 500, 'body': 'Failed to delete lobby.'}
        # --- END deleteLobby Handler ---

        # --- NEW: kickPlayer Handler ---
        elif action == 'kickPlayer':
            # Add logging to confirm entry
            logger.info(f"Processing 'kickPlayer' from connection {connection_id}")
            lobby_id = message_data.get('lobbyId')
            player_slot_to_kick = message_data.get('playerSlot') # Expect 'P1' or 'P2'

            # Validate input
            if not lobby_id or not player_slot_to_kick or player_slot_to_kick not in ['P1', 'P2']:
                logger.warning(f"kickPlayer request from {connection_id} missing lobbyId or valid playerSlot. Data: {message_data}")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Missing lobbyId or valid playerSlot ('P1' or 'P2')."})
                return {'statusCode': 400, 'body': 'Missing lobbyId or valid playerSlot.'}
            logger.info(f"Received kick request for Slot: {player_slot_to_kick}, Lobby: {lobby_id}")

            try:
                # Get lobby item (ConsistentRead recommended for checks)
                logger.info(f"Fetching lobby {lobby_id} for kick attempt by {connection_id}")
                response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                lobby_item = response.get('Item')
                if not lobby_item:
                    logger.warning(f"Lobby {lobby_id} not found for kick attempt by {connection_id}.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Lobby not found."})
                    return {'statusCode': 404, 'body': 'Lobby not found.'}
                logger.info(f"Lobby {lobby_id} found.")

                # Verify requester is the host
                host_connection_id = lobby_item.get('hostConnectionId')
                if connection_id != host_connection_id:
                    logger.warning(f"Unauthorized kick attempt on lobby {lobby_id} by non-host {connection_id}.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Only the host can kick players."})
                    return {'statusCode': 403, 'body': 'Forbidden: Not the host.'}
                logger.info(f"Host {connection_id} verified.")

                # Get target player info based on playerSlot
                target_slot_label = f"player{player_slot_to_kick[1]}"
                kicked_connection_id = lobby_item.get(f"{target_slot_label}ConnectionId")
                kicked_player_name = lobby_item.get(f"{target_slot_label}Name", player_slot_to_kick)

                # Check if slot is actually occupied
                if not kicked_connection_id:
                    logger.warning(f"Host {connection_id} tried to kick {player_slot_to_kick} from lobby {lobby_id}, but slot is empty.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Player slot {player_slot_to_kick} is already empty."})
                    return {'statusCode': 400, 'body': 'Player slot already empty.'}

                # Prevent host kicking self if they joined as player
                if kicked_connection_id == host_connection_id:
                     logger.warning(f"Host {connection_id} tried to kick themselves from slot {player_slot_to_kick} in lobby {lobby_id}.")
                     send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Host cannot kick themselves."})
                     return {'statusCode': 400, 'body': 'Host cannot kick self.'}
                logger.info(f"Target player identified: Slot={player_slot_to_kick}, Name={kicked_player_name}, ConnId={kicked_connection_id}")

                # --- CORRECTED LOGIC: Notify Kicked Player FIRST ---
                logger.info(f"Sending forceRedirect notification to kicked player {kicked_connection_id}")
                force_redirect_payload = {
                    "type": "forceRedirect",
                    "reason": "kicked",
                    "message": f"You were kicked from lobby {lobby_id} by the host."
                }
                send_message_to_client(apigw_management_client, kicked_connection_id, force_redirect_payload)
                # --- END CORRECTED LOGIC ---

                # Prepare attribute names and values for robust update
                last_action_msg = f"Host kicked {kicked_player_name}."
                conn_id_attr_name = f"{target_slot_label}ConnectionId"
                name_attr_name = f"{target_slot_label}Name"
                ready_attr_name = f"{target_slot_label}Ready"
                sequences_attr_name = f"{target_slot_label}Sequences"
                score_attr_name = f"{target_slot_label}WeightedBoxScore"
                submitted_attr_name = f"{target_slot_label}ScoreSubmitted"

                # Placeholders for ExpressionAttributeNames
                conn_id_ph = "#connId"
                name_ph = "#name"
                ready_ph = "#ready"
                sequences_ph = "#seq"
                score_ph = "#score"
                submitted_ph = "#submitted"
                la_ph = "#la"

                update_expression = f"REMOVE {conn_id_ph}, {name_ph}, {sequences_ph}, {score_ph} SET {ready_ph} = :falseVal, {submitted_ph} = :falseVal, {la_ph} = :lastAct"
                expression_attribute_names = {
                    conn_id_ph: conn_id_attr_name,
                    name_ph: name_attr_name,
                    sequences_ph: sequences_attr_name,
                    score_ph: score_attr_name,
                    ready_ph: ready_attr_name,
                    submitted_ph: submitted_attr_name,
                    la_ph: 'lastAction'
                }
                expression_attribute_values = {
                    ':falseVal': False,
                    ':lastAct': last_action_msg,
                    ':kick_conn_id_val': kicked_connection_id
                }
                condition_expression_str = f"attribute_exists({conn_id_ph}) AND {conn_id_ph} = :kick_conn_id_val"

                logger.info(f"Attempting UpdateItem for kick. Update: {update_expression}, Condition: {condition_expression_str}, Names: {expression_attribute_names}, Values: {expression_attribute_values}")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression,
                    ConditionExpression=condition_expression_str,
                    ExpressionAttributeNames=expression_attribute_names,
                    ExpressionAttributeValues=expression_attribute_values
                )
                logger.info(f"Lobby {lobby_id} updated successfully.")

                # Cleanup kicked player's connection item
                try:
                    logger.info(f"Cleaning up connection table for kicked player {kicked_connection_id}")
                    connections_table.update_item(
                        Key={'connectionId': kicked_connection_id},
                        UpdateExpression="REMOVE currentLobbyId"
                    )
                    logger.info(f"Removed currentLobbyId from kicked connection {kicked_connection_id}")
                except Exception as conn_clean_err:
                    # Log error but don't fail the whole operation
                    logger.error(f"Failed to cleanup connection {kicked_connection_id} after kick: {conn_clean_err}")

                # Broadcast updated state to remaining participants
                logger.info(f"Broadcasting state update after kick for lobby {lobby_id}")
                broadcast_lobby_state(lobby_id, apigw_management_client, last_action=last_action_msg, exclude_connection_id=kicked_connection_id)

                logger.info(f"Kick player action completed successfully for lobby {lobby_id}")
                return {'statusCode': 200, 'body': 'Player kicked successfully.'}

            except ClientError as e:
                 if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                     # Log more details including the exception
                     logger.warning(f"Conditional check failed for kickPlayer in lobby {lobby_id}. Player slot: {player_slot_to_kick}, Expected ConnId: {kicked_connection_id}. Maybe player left or changed? Full error: {e}", exc_info=True)
                     send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Failed to kick player, slot may have changed."})
                     # Broadcast current state so host sees the actual situation
                     broadcast_lobby_state(lobby_id, apigw_management_client)
                     return {'statusCode': 409, 'body': 'Conflict, player slot changed.'}
                 else:
                      # Log the full error traceback for other ClientErrors
                      logger.error(f"Error processing kickPlayer for {connection_id} on lobby {lobby_id} (ClientError): {str(e)}", exc_info=True)
                      send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Failed to kick player due to database error."})
                      return {'statusCode': 500, 'body': 'Failed to kick player (database error).'}
            except Exception as e:
                 # Log the full error traceback for any other unexpected errors
                 logger.error(f"Unexpected error processing kickPlayer for {connection_id} on lobby {lobby_id}: {str(e)}", exc_info=True)
                 send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Internal server error during kick."})
                 return {'statusCode': 500, 'body': 'Failed to kick player (server error).'}
        # --- END CORRECTED & FINAL kickPlayer Handler ---

        # --- NEW: hostJoinSlot Handler ---
        elif action == 'hostJoinSlot':
            logger.info(f"Processing 'hostJoinSlot' for connection {connection_id}")
            lobby_id = message_data.get('lobbyId')
            if not lobby_id:
                logger.warning(f"hostJoinSlot request from {connection_id} missing lobbyId.")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Lobby ID missing."})
                return {'statusCode': 400, 'body': 'Missing lobbyId.'}

            try:
                # Get lobby item with ConsistentRead to ensure we see the latest state
                response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                lobby_item = response.get('Item')
                if not lobby_item:
                    logger.warning(f"Lobby {lobby_id} not found for host join attempt by {connection_id}.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Lobby not found."})
                    return {'statusCode': 404, 'body': 'Lobby not found.'}

                # Verify requester is the host
                host_connection_id = lobby_item.get('hostConnectionId')
                host_name = lobby_item.get('hostName', 'Host')
                if connection_id != host_connection_id:
                    logger.warning(f"Unauthorized hostJoinSlot attempt on lobby {lobby_id} by non-host {connection_id}.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Only the host can use this action."})
                    return {'statusCode': 403, 'body': 'Forbidden: Not the host.'}

                # Check if host is already P1 or P2
                if lobby_item.get('player1ConnectionId') == host_connection_id or lobby_item.get('player2ConnectionId') == host_connection_id:
                    logger.info(f"Host {connection_id} already in a player slot for lobby {lobby_id}.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "info", "message": "You are already assigned to a player slot."})
                    return {'statusCode': 200, 'body': 'Host already in slot.'}

                # Find first available slot and prepare update
                assigned_slot_num = None # 1 or 2
                update_expression = None
                expression_values = {
                    ':hostConnId': host_connection_id,
                    ':hostName': host_name,
                    ':falseVal': False # Set ready status to False initially
                }
                condition_expression = None

                # Try to join P1 first, then P2
                max_retries = 3
                retry_count = 0
                success = False
                last_error = None

                while retry_count < max_retries and not success:
                    try:
                        # Refresh lobby state before each attempt
                        response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                        lobby_item = response.get('Item')
                        
                        # Check slots again with fresh data
                        if not lobby_item.get('player1ConnectionId'):  # This will work for both None and missing field
                            assigned_slot_num = 1
                            update_expression = "SET player1ConnectionId = :hostConnId, player1Name = :hostName, player1Ready = :falseVal, lastAction = :lastAct"
                            # Check for both missing field and None value
                            condition_expression = "attribute_not_exists(player1ConnectionId) OR player1ConnectionId = :nullVal OR player1ConnectionId = :emptyStr"
                            expression_values[':lastAct'] = f"{host_name} (Host) joined as Player 1."
                            expression_values[':nullVal'] = None
                            expression_values[':emptyStr'] = ""
                        elif not lobby_item.get('player2ConnectionId'):  # This will work for both None and missing field
                            assigned_slot_num = 2
                            update_expression = "SET player2ConnectionId = :hostConnId, player2Name = :hostName, player2Ready = :falseVal, lastAction = :lastAct"
                            # Check for both missing field and None value
                            condition_expression = "attribute_not_exists(player2ConnectionId) OR player2ConnectionId = :nullVal OR player2ConnectionId = :emptyStr"
                            expression_values[':lastAct'] = f"{host_name} (Host) joined as Player 2."
                            expression_values[':nullVal'] = None
                            expression_values[':emptyStr'] = ""
                        else:
                            logger.warning(f"Host {connection_id} tried to join lobby {lobby_id}, but both slots are full.")
                            send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Lobby is full, cannot join as player."})
                            return {'statusCode': 400, 'body': 'Lobby is full.'}

                        assigned_slot_str = f"P{assigned_slot_num}"
                        last_action_msg = expression_values[':lastAct']
                        logger.info(f"Host {connection_id} attempting to join slot {assigned_slot_str} in lobby {lobby_id} (attempt {retry_count + 1}/{max_retries})")
                        logger.info(f"Update expression: {update_expression}")
                        logger.info(f"Condition expression: {condition_expression}")
                        logger.info(f"Expression values: {expression_values}")

                        # Attempt to update the lobby item conditionally
                        lobbies_table.update_item(
                            Key={'lobbyId': lobby_id},
                            UpdateExpression=update_expression,
                            ConditionExpression=condition_expression,
                            ExpressionAttributeValues=expression_values
                        )
                        success = True
                        logger.info(f"Host {connection_id} successfully joined slot {assigned_slot_str} in lobby {lobby_id}.")

                        # Send lobbyJoined message to the host to update their client state
                        send_message_to_client(apigw_management_client, connection_id, {
                            "type": "lobbyJoined",
                            "lobbyId": lobby_id,
                            "assignedSlot": assigned_slot_str,
                            "isHost": True, # Keep host status
                            "message": f"Successfully joined as {assigned_slot_str}"
                        })

                        # Broadcast updated state to all participants
                        broadcast_lobby_state(lobby_id, apigw_management_client, last_action=last_action_msg)

                        return {'statusCode': 200, 'body': 'Host joined slot successfully.'}

                    except ClientError as e:
                        if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                            retry_count += 1
                            last_error = e
                            if retry_count < max_retries:
                                # Wait a short time before retrying (increasing delay with each retry)
                                time.sleep(0.1 * retry_count)
                                continue
                            else:
                                logger.warning(f"Failed to join slot after {max_retries} attempts for host {connection_id} in lobby {lobby_id}. Last error: {str(last_error)}")
                                # Get final state to show what changed
                                final_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                                final_lobby_item = final_response.get('Item')
                                if final_lobby_item:
                                    logger.info(f"Final lobby state: P1={final_lobby_item.get('player1ConnectionId')}, P2={final_lobby_item.get('player2ConnectionId')}")
                                    logger.info(f"Final lobby state details: {json.dumps(final_lobby_item, default=str)}")
                                
                                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Failed to join slot after multiple attempts. Please try again."})
                                broadcast_lobby_state(lobby_id, apigw_management_client) # Broadcast current state so host sees who joined
                                return {'statusCode': 409, 'body': 'Conflict, slot taken.'}
                        else:
                            raise e

            except Exception as e:
                logger.error(f"Error processing hostJoinSlot for {connection_id} on lobby {lobby_id}: {str(e)}", exc_info=True)
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Failed to join slot: {str(e)}"})
                return {'statusCode': 500, 'body': 'Failed to join slot.'}
        # --- END hostJoinSlot Handler ---

        elif action == 'resetDraft':
            logger.info(f"Processing 'resetDraft' for connection {connection_id}")
            lobby_id = message_data.get('lobbyId')
            if not lobby_id:
                logger.warning(f"resetDraft request from {connection_id} missing lobbyId.")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Lobby ID missing."})
                return {'statusCode': 400, 'body': 'Missing lobbyId.'}

            try:
                # 1. Get lobby item (ConsistentRead recommended for checks)
                response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                lobby_item = response.get('Item')
                if not lobby_item:
                    logger.warning(f"Lobby {lobby_id} not found for reset attempt by {connection_id}.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Lobby not found."})
                    return {'statusCode': 404, 'body': 'Lobby not found.'}

                # 2. Verify requester is the host
                host_connection_id = lobby_item.get('hostConnectionId')
                if connection_id != host_connection_id:
                    logger.warning(f"Unauthorized reset draft attempt on lobby {lobby_id} by non-host {connection_id}.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Only the host can reset the draft."})
                    return {'statusCode': 403, 'body': 'Forbidden: Not the host.'}

                # 3. Reset the lobby state back to WAITING and clear draft fields
                last_action_msg = "Draft was reset by the host."

                # Define attributes to REMOVE, ensuring 'turnExpiresAt' is included
                attributes_to_remove = [
                    "currentPhase", "currentTurn", "currentStepIndex", "turnExpiresAt",
                    "bans", "player1Picks", "player2Picks", "availableResonators",
                    "effectiveDraftOrder", "playerRoles",
                    "player1Sequences", "player1WeightedBoxScore", "player2Sequences", "player2WeightedBoxScore",
                    "equilibrationBansAllowed", "equilibrationBansMade", "currentEquilibrationBanner"
                ]

                update_expression_set_parts = [
                    "#ls = :waitState",
                    "#p1r = :falseVal",
                    "#p2r = :falseVal",
                    "#la = :lastAct",
                    "#p1ss = :falseVal",
                    "#p2ss = :falseVal"
                ]
                expression_attribute_names = {
                    '#ls': 'lobbyState', '#p1r': 'player1Ready', '#p2r': 'player2Ready', '#la': 'lastAction',
                    '#p1ss': 'player1ScoreSubmitted', '#p2ss': 'player2ScoreSubmitted'
                }
                expression_attribute_values = {
                    ':waitState': 'WAITING',
                    ':falseVal': False,
                    ':lastAct': last_action_msg
                }

                update_expression_remove_parts = []
                for i, attr_name in enumerate(attributes_to_remove):
                    name_placeholder = f"#rem{i}"
                    expression_attribute_names[name_placeholder] = attr_name
                    update_expression_remove_parts.append(name_placeholder)

                update_expression = "SET " + ", ".join(update_expression_set_parts)
                if update_expression_remove_parts:
                    update_expression += " REMOVE " + ", ".join(update_expression_remove_parts)

                logger.info(f"Resetting draft for lobby {lobby_id}. Update: {update_expression}")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression,
                    ExpressionAttributeNames=expression_attribute_names,
                    ExpressionAttributeValues=expression_attribute_values
                )
                logger.info(f"Lobby {lobby_id} draft reset successfully.")

                # 4. Broadcast the reset state to all participants
                broadcast_lobby_state(lobby_id, apigw_management_client, last_action=last_action_msg)

                return {'statusCode': 200, 'body': 'Draft reset successfully.'}

            except ClientError as e:
                logger.error(f"Error processing resetDraft for {connection_id} on lobby {lobby_id} (ClientError): {str(e)}", exc_info=True)
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Failed to reset draft: {str(e)}"})
                return {'statusCode': 500, 'body': 'Failed to reset draft (database error).'}
            except Exception as e:
                logger.error(f"Unexpected error processing resetDraft for {connection_id} on lobby {lobby_id}: {str(e)}", exc_info=True)
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Internal server error during draft reset."})
                return {'statusCode': 500, 'body': 'Failed to reset draft (server error).'}

        # --- ADD hostLeaveSlot Handler ---
        elif action == 'hostLeaveSlot':
            logger.info(f"Processing 'hostLeaveSlot' for connection {connection_id}")
            lobby_id = message_data.get('lobbyId')
            if not lobby_id:
                logger.warning(f"hostLeaveSlot request from {connection_id} missing lobbyId.")
                # Don't send error back, host state might be desynced, just fail silently server-side.
                return {'statusCode': 400, 'body': 'Missing lobbyId.'}

            if not lobby_id:
                return {'statusCode': 400, 'body': 'Missing lobbyId parameter.'}

            try:
                # Verify requester is host of the lobby
                lobby_response = lobbies_table.get_item(Key={'lobbyId': lobby_id})
                lobby_item = lobby_response.get('Item')

                if not lobby_item:
                    send_message_to_client(apigw_management_client, connection_id, {
                        "type": "error", "message": "Lobby not found."
                    })
                    return {'statusCode': 404, 'body': 'Lobby not found.'}

                if lobby_item.get('hostConnectionId') != connection_id:
                    send_message_to_client(apigw_management_client, connection_id, {
                        "type": "error", "message": "Only the host can perform this action."
                    })
                    return {'statusCode': 403, 'body': 'Not authorized as host.'}

                # Determine which slot the host is in
                player_slot_conn = None
                player_slot_name = None
                player_slot_label = None

                if lobby_item.get('player1ConnectionId') == connection_id:
                    player_slot_conn = 'player1ConnectionId'
                    player_slot_name = 'player1Name'
                    player_slot_label = 'player1'
                elif lobby_item.get('player2ConnectionId') == connection_id:
                    player_slot_conn = 'player2ConnectionId'
                    player_slot_name = 'player2Name'
                    player_slot_label = 'player2'
                else:
                    send_message_to_client(apigw_management_client, connection_id, {
                        "type": "error", "message": "You are not in any player slot to leave."
                    })
                    return {'statusCode': 400, 'body': 'Host not in a player slot.'}

                host_name = lobby_item.get('hostName', 'Host') # For action message
                player_name = lobby_item.get(player_slot_name, f"Player {player_slot_label[-1]}") # For action message

                # Update lobby item to remove host from the player slot and clear score data
                remove_fields = [player_slot_conn, player_slot_name, 
                               f"{player_slot_label}Sequences", 
                               f"{player_slot_label}WeightedBoxScore"]
                
                remove_expr = "REMOVE " + ", ".join(remove_fields)
                set_expr = f"SET {player_slot_label}Ready = :falseVal, {player_slot_label}ScoreSubmitted = :falseVal, lastAction = :lastAct"
                
                update_expression = f"{remove_expr} {set_expr}"
                expression_values = {
                    ':falseVal': False,
                    ':lastAct': f"{host_name} left {player_name}'s slot."
                }

                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression,
                    ExpressionAttributeValues=expression_values
                )

                logger.info(f"Host left slot {player_slot_label}. Clearing score data for that slot.")

                # Send lobbyJoined with slot: null to indicate user is no longer in a slot
                send_message_to_client(apigw_management_client, connection_id, {
                    "type": "lobbyJoined",
                    "lobbyId": lobby_id,
                    "slot": None, # Not in a specific slot
                    "isHost": True # Still the host
                })

                # Broadcast new state to all (which now shows an empty slot)
                broadcast_lobby_state(lobby_id, apigw_management_client, 
                                      last_action=f"{host_name} left {player_name}'s slot.")

                return {'statusCode': 200, 'body': 'Host left player slot.'}

            except Exception as e:
                logger.error(f"Error processing hostLeaveSlot: {str(e)}", exc_info=True)
                send_message_to_client(apigw_management_client, connection_id, {
                    "type": "error", "message": "Failed to process hostLeaveSlot action."
                })
                return {'statusCode': 500, 'body': 'Failed to process hostLeaveSlot.'}

        elif action == 'submitBoxScore':
            lobby_id = message_data.get('lobbyId')
            received_sequences = message_data.get('sequences', {}) # Dict: {'CharName': S_val}
            # client_total_score = message_data.get('totalScore', 0) # For logging/debug if needed

            if not lobby_id or not connection_id:
                return {'statusCode': 400, 'body': 'Missing lobbyId or connectionId.'}

            logger.info(f"Processing 'submitBoxScore' from {connection_id} for lobby {lobby_id}")

            try:
                lobby_item = lobbies_table.get_item(Key={'lobbyId': lobby_id}).get('Item')
                if not lobby_item:
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Lobby not found."})
                    return {'statusCode': 404, 'body': 'Lobby not found.'}

                player_slot_label = None
                player_name_for_action = "Unknown Player"
                if lobby_item.get('player1ConnectionId') == connection_id:
                    player_slot_label = 'player1'
                    player_name_for_action = lobby_item.get('player1Name', 'Player 1')
                elif lobby_item.get('player2ConnectionId') == connection_id:
                    player_slot_label = 'player2'
                    player_name_for_action = lobby_item.get('player2Name', 'Player 2')
                else:
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "You are not an active player in this lobby."})
                    return {'statusCode': 403, 'body': 'Not an active player.'}

                # Recalculate weighted score on backend for security/consistency
                backend_calculated_score = 0
                valid_sequences_to_store = {}
                for char_name, s_value in received_sequences.items():
                    if isinstance(s_value, int) and 0 <= s_value <= 6:
                        backend_calculated_score += SEQUENCE_POINTS.get(s_value, 0)
                        valid_sequences_to_store[char_name] = s_value
                    else:
                        logger.warning(f"Lobby {lobby_id}: Invalid sequence value {s_value} for {char_name} from {connection_id}. Ignoring for score.")
                
                logger.info(f"Lobby {lobby_id}: Player {player_name_for_action} ({player_slot_label}) submitted sequences. Backend calculated score: {backend_calculated_score}")

                update_expression_parts = []
                expression_attribute_values = {}
                
                update_expression_parts.append(f"{player_slot_label}Sequences = :seq")
                expression_attribute_values[':seq'] = valid_sequences_to_store
                
                update_expression_parts.append(f"{player_slot_label}WeightedBoxScore = :score")
                expression_attribute_values[':score'] = backend_calculated_score
                
                update_expression_parts.append(f"{player_slot_label}ScoreSubmitted = :trueVal")
                expression_attribute_values[':trueVal'] = True
                
                last_action_msg = f"{player_name_for_action} submitted their Resonator sequences."
                update_expression_parts.append(f"lastAction = :lastAct")
                expression_attribute_values[':lastAct'] = last_action_msg

                update_expression = "SET " + ", ".join(update_expression_parts)

                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression,
                    ExpressionAttributeValues=expression_attribute_values
                )

                send_message_to_client(apigw_management_client, connection_id, {"type": "boxScoreSubmitted"})
                broadcast_lobby_state(lobby_id, apigw_management_client, last_action=last_action_msg)
                
                return {'statusCode': 200, 'body': 'Box score submitted.'}

            except Exception as e:
                logger.error(f"Error processing submitBoxScore for {lobby_id}: {str(e)}", exc_info=True)
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Failed to submit box score."})
                return {'statusCode': 500, 'body': 'Failed to process box score.'}

        else:
            # Unknown action - echo back or send error/info
            logger.info(f"Received unknown action '{action}' or no action from {connection_id}. Echoing.")
            send_message_to_client(apigw_management_client, connection_id, {
                "type": "echo",
                "received_message": message_data
            })
            return {'statusCode': 200, 'body': 'Message echoed.'}

    except Exception as e:
        # Catch-all for errors during action processing
        logger.error(f"Error processing message action: {str(e)}", exc_info=True)
        if connection_id:
            send_message_to_client(apigw_management_client, connection_id, {
                "type": "error",
                "message": "Server error processing your request."
            })
        return {'statusCode': 500, 'body': f'Failed to process action {action}.'}