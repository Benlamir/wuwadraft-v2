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
                return str(obj)
        # Let the base class default method raise the TypeError
        return json.JSONEncoder.default(self, obj)
# --- END Helper Function ---

# --- ADD HELPER FUNCTION FOR TURN LOGIC ---
def determine_next_state(current_step_index):
    """Calculates the next phase, turn, and index based on the current step index."""
    next_index = current_step_index + 1
    if next_index < len(DRAFT_ORDER):
        next_phase, next_turn = DRAFT_ORDER[next_index]
        logger.info(f"Draft progression: From index {current_step_index} -> To index {next_index} ({next_phase}, {next_turn})")
        return next_phase, next_turn, next_index # Return next index too
    else:
        # Reached the end of the defined order
        logger.info(f"Draft progression: Reached end of DRAFT_ORDER (index {current_step_index}). Setting state to COMPLETE.")
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
    'Phoebe'
])

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
DRAFT_COMPLETE_PHASE = 'DRAFT_COMPLETE' # Constant for completed state
# --- End Draft Order Definition ---

# --- Configuration ---
CONNECTIONS_TABLE_NAME = 'WuwaDraftConnections'
LOBBIES_TABLE_NAME = 'WuwaDraftLobbies' # Use your exact table name
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

def send_message_to_client(apigw_client, connection_id, payload):
    """Sends a JSON payload to a specific connectionId."""
    try:
        logger.info(f"Sending message to {connection_id}: {json.dumps(payload)}")
        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(payload).encode('utf-8') # Send JSON string as bytes
        )
        logger.info(f"Message sent successfully to {connection_id}")
        return True
    except apigw_client.exceptions.GoneException:
        logger.warning(f"Client {connection_id} is gone. Cannot send message.")
        # TODO: Consider cleaning up connection from Connections table here if needed
    except Exception as e:
        logger.error(f"Failed to post message to connectionId {connection_id}: {str(e)}")
    return False

# --- Helper Function to Broadcast Lobby State ---
def broadcast_lobby_state(lobby_id, apigw_client, last_action=None, exclude_connection_id=None):
    """Fetches the latest lobby state and broadcasts it to all participants."""
    try:
        logger.info(f"Broadcasting state for lobby {lobby_id}. Last Action: {last_action}. Excluding: {exclude_connection_id}")
        # Use ConsistentRead to get the absolute latest state
        final_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
        final_lobby_item = final_response.get('Item')

        if not final_lobby_item:
            logger.warning(f"Cannot broadcast state for lobby {lobby_id}, item not found (may have been deleted).")
            return False # Cannot broadcast if lobby doesn't exist

        # Construct the broadcast payload (ensure Decimal is handled for json.dumps)
        # Convert Decimal types before creating the payload or use DecimalEncoder
        state_payload = {
            "type": "lobbyStateUpdate",
            "lobbyId": lobby_id,
            "hostName": final_lobby_item.get('hostName'),
            "player1Name": final_lobby_item.get('player1Name'),
            "player2Name": final_lobby_item.get('player2Name'),
            "lobbyState": final_lobby_item.get('lobbyState'),
            "player1Ready": final_lobby_item.get('player1Ready', False),
            "player2Ready": final_lobby_item.get('player2Ready', False),
            "currentPhase": final_lobby_item.get('currentPhase'),
            "currentTurn": final_lobby_item.get('currentTurn'),
            "bans": final_lobby_item.get('bans', []),
            "player1Picks": final_lobby_item.get('player1Picks', []),
            "player2Picks": final_lobby_item.get('player2Picks', []),
            "availableResonators": final_lobby_item.get('availableResonators', []),
            "turnExpiresAt": final_lobby_item.get('turnExpiresAt')
            # currentStepIndex is removed - client doesn't need it
        }
        # Add lastAction if provided
        if last_action:
            state_payload["lastAction"] = last_action

        # Use DecimalEncoder for safe JSON serialization
        payload_json = json.dumps(state_payload, cls=DecimalEncoder)
        logger.info(f"Constructed broadcast payload (JSON): {payload_json}")

        # Get all participant connection IDs from the fetched item
        participants = [
            final_lobby_item.get('hostConnectionId'),
            final_lobby_item.get('player1ConnectionId'),
            final_lobby_item.get('player2ConnectionId')
        ]
        valid_connection_ids = [pid for pid in participants if pid]

        # Send to all valid connections, optionally excluding one
        failed_sends = []
        success_count = 0
        for recipient_id in valid_connection_ids:
            if recipient_id == exclude_connection_id:
                continue # Skip excluded connection
            # Use the JSON string created with the encoder
            if send_message_to_client(apigw_client, recipient_id, json.loads(payload_json)): # Send dict back to helper
                 success_count += 1
            else:
                failed_sends.append(recipient_id)

        if failed_sends:
            logger.warning(f"Failed to send state update to some connections: {failed_sends}")

        logger.info(f"Broadcast complete. Sent to {success_count} participant(s).")
        return True # Indicate broadcast attempt was made

    except Exception as broadcast_err:
        logger.error(f"Error during broadcast_lobby_state for {lobby_id}: {str(broadcast_err)}", exc_info=True)
        return False
# --- End Helper Function ---

def handler(event, context):
    # --- ADD THIS LINE AS THE VERY FIRST LINE OF THE HANDLER ---
    logger.info(f"Raw event received: {json.dumps(event)}")
    # --- END ADDITION ---

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
            logger.info(f"Processing 'createLobby' action for {connection_id} ({player_name})")

            # 1. Generate a unique Lobby ID (using first 8 chars of UUID4)
            lobby_id = str(uuid.uuid4())[:8].upper()
            logger.info(f"Generated lobbyId: {lobby_id}")

            # 2. Create the lobby item in WuwaDraftLobbies table
            timestamp = datetime.now(timezone.utc).isoformat()
            new_lobby_item = {
                'lobbyId': lobby_id,
                'hostConnectionId': connection_id,
                'lobbyState': 'WAITING', # Initial state
                'player1ConnectionId': None,
                'player2ConnectionId': None,
                'player1Name': None,
                'player2Name': None,
                'createdAt': timestamp,
                'hostName': player_name # Store host's name
                # Add other initial state fields later: picks, bans, turn, timer etc.
            }
            lobbies_table.put_item(Item=new_lobby_item)
            logger.info(f"Lobby item created in {LOBBIES_TABLE_NAME}")

            # 3. Update the connection item in WuwaDraftConnections table
            connections_table.update_item(
                Key={'connectionId': connection_id},
                UpdateExpression="SET currentLobbyId = :lid, playerName = :pn",
                ExpressionAttributeValues={
                    ':lid': lobby_id,
                    ':pn': player_name
                }
            )
            logger.info(f"Connection item updated in {CONNECTIONS_TABLE_NAME}")

            # 4. Send confirmation back to the host
            response_payload = {
                "type": "lobbyCreated",
                "lobbyId": lobby_id,
                "isHost": True, # Let the client know they are the host
                "message": f"Lobby {lobby_id} created successfully."
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
                    "isHost": False, # Joining player is not the host
                    "message": f"Successfully joined lobby {lobby_id} as {assigned_slot}."
                    # TODO: Send current full lobby state?
                }
                send_message_to_client(apigw_management_client, connection_id, response_payload)

                # --- BEGIN NOTIFICATION BLOCK ---
                # Fetch the latest lobby state again to ensure we have player names/IDs
                try:
                    updated_response = lobbies_table.get_item(Key={'lobbyId': lobby_id})
                    updated_lobby_item = updated_response.get('Item')
                    if not updated_lobby_item:
                        logger.error(f"Could not re-fetch lobby {lobby_id} for state update broadcast.")
                        # Don't fail the whole join, just log error and return
                        return {'statusCode': 200, 'body': 'Player joined lobby, but failed to broadcast update.'}

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
                        "currentPhase": updated_lobby_item.get('currentPhase'),
                        "currentTurn": updated_lobby_item.get('currentTurn'),
                        "bans": updated_lobby_item.get('bans', []),
                        "player1Picks": updated_lobby_item.get('player1Picks', []),
                        "player2Picks": updated_lobby_item.get('player2Picks', []),
                        "availableResonators": updated_lobby_item.get('availableResonators', []),
                        "turnExpiresAt": updated_lobby_item.get('turnExpiresAt')
                    }
                    logger.info(f"Broadcasting lobby state update: {state_payload}")

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
                    # Optional: Send error back to client?
                    return {'statusCode': 404, 'body': 'Connection not associated with a lobby.'}
                lobby_id = connection_item['currentLobbyId']
                player_name = connection_item.get('playerName', 'Unknown') # Get name from connection record
                logger.info(f"Found lobby {lobby_id} for connection {connection_id}")
            except Exception as e:
                 logger.error(f"Failed to get connection details for {connection_id}: {str(e)}")
                 return {'statusCode': 500, 'body': 'Error finding connection details.'}

            # 2. Get the current lobby state
            try:
                response = lobbies_table.get_item(Key={'lobbyId': lobby_id})
                lobby_item = response.get('Item')
                if not lobby_item:
                    logger.warning(f"Lobby {lobby_id} not found (though connection table referenced it).")
                    # Optional: Send error back to client?
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
                # Sender is not P1 or P2 (maybe Host?) - Ignore ready signal? Or handle host readiness?
                logger.warning(f"Connection {connection_id} sent 'playerReady' but is not P1 or P2 in lobby {lobby_id}.")
                return {'statusCode': 200, 'body': 'Ready signal ignored (not P1 or P2).'}

            # 4. Update the player's ready status in WuwaDraftLobbies
            try:
                logger.info(f"Updating {player_slot_key} ready status to True in lobby {lobby_id}")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=f"SET {ready_flag_key} = :true", # Use f-string for dynamic key
                    ExpressionAttributeValues={':true': True}
                    # Optional: ConditionExpression=f"attribute_not_exists({ready_flag_key}) OR {ready_flag_key} = :false"
                    # with ExpressionAttributeValues={':true': True, ':false': False}
                )
                logger.info(f"Updated {player_slot_key} ready status in lobby {lobby_id}")
            except Exception as e:
                 logger.error(f"Failed to update ready status for {player_slot_key} in {lobby_id}: {str(e)}")
                 return {'statusCode': 500, 'body': 'Failed to update ready status.'}


            # --- CRITICAL FIX: Re-fetch the LATEST lobby state AFTER the update ---
            try:
                logger.info(f"Re-fetching lobby state for {lobby_id}")
                updated_response = lobbies_table.get_item(Key={'lobbyId': lobby_id})
                updated_lobby_item = updated_response.get('Item')
                if not updated_lobby_item:
                    logger.error(f"Could not re-fetch lobby {lobby_id} after ready update.")
                    return {'statusCode': 500, 'body': 'Failed to fetch updated lobby state.'}
                logger.info(f"Successfully re-fetched lobby state: {updated_lobby_item}")
            except Exception as e:
                 logger.error(f"Failed to re-fetch lobby {lobby_id} after ready update: {str(e)}")
                 return {'statusCode': 500, 'body': 'Error fetching updated lobby state.'}
            # ---------------------------------------------------------


            # 5. Check if both players are now ready using the UPDATED item
            p1_ready = updated_lobby_item.get('player1Ready', False)
            p2_ready = updated_lobby_item.get('player2Ready', False)
            logger.info(f"Checking readiness after update. P1 Ready: {p1_ready}, P2 Ready: {p2_ready}")

            # Explicitly get current state values into local variables BEFORE the 'if'
            current_lobby_state = updated_lobby_item.get('lobbyState', 'WAITING')
            current_phase = updated_lobby_item.get('currentPhase')
            current_turn = updated_lobby_item.get('currentTurn')

            draft_started = False # Flag to know if we updated DDB

            # 6. If both ready, update lobby state to start draft (only if not already started)
            if p1_ready and p2_ready and current_lobby_state == 'WAITING':
                logger.info(f"Both players ready! Updating lobby state to DRAFTING for {lobby_id}")
                # Update local variables INSIDE the 'if'
                current_lobby_state = 'DRAFTING'
                current_phase = 'BAN1'
                current_turn = 'P1'
                draft_started = True # Mark that draft state *attempt* was initiated

                # Initialize draft state in DDB
                try:
                    # --- Calculate expiry for the FIRST turn ---
                    now = datetime.now(timezone.utc)
                    expires_at_dt = now + timedelta(seconds=TURN_DURATION_SECONDS)
                    turn_expires_at_iso = expires_at_dt.isoformat()
                    logger.info(f"Setting initial turn expiry for lobby {lobby_id} to: {turn_expires_at_iso}")

                    # Prepare values
                    expression_attribute_values_dict = {
                            ':newState': current_lobby_state,
                            ':phase': current_phase,
                            ':turn': current_turn,
                            ':emptyList': [],
                            ':allRes': ALL_RESONATOR_NAMES,
                            ':zero': 0,
                            ':expires': turn_expires_at_iso,
                            ':waitState': 'WAITING' # Value for condition check
                        }
                    # Add condition check
                    condition_expression_string = "lobbyState = :waitState" # Only update if still WAITING

                    logger.info(f"DEBUG: Initializing draft state with: {json.dumps(expression_attribute_values_dict)}")
                    logger.info(f"DEBUG: Initializing ConditionExpression: {condition_expression_string}")

                    lobbies_table.update_item(
                        Key={'lobbyId': lobby_id},
                        UpdateExpression="""
                            SET lobbyState = :newState,
                                currentPhase = :phase,
                                currentTurn = :turn,
                                bans = :emptyList,
                                player1Picks = :emptyList,
                                player2Picks = :emptyList,
                                availableResonators = :allRes,
                                currentStepIndex = :zero,
                                turnExpiresAt = :expires
                        """,
                        ConditionExpression=condition_expression_string, # <-- ADD THIS CONDITION
                        ExpressionAttributeValues=expression_attribute_values_dict
                    )
                    logger.info(f"Lobby {lobby_id} state updated to DRAFTING with draft initialization (conditional)")

                except ClientError as e: # <-- ADD EXCEPTION HANDLING
                     if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                          logger.warning(f"Draft initialization failed for lobby {lobby_id} - Condition Check Failed (likely already started by concurrent request). Ignoring this update attempt.")
                          # Don't return an error, just log. The other invocation succeeded.
                          # Ensure draft_started remains True so broadcast happens based on latest state
                          draft_started = True
                     else:
                          logger.error(f"Failed to update lobby state to DRAFTING for {lobby_id} (ClientError): {str(e)}")
                          draft_started = False # Revert flag on other DDB errors
                except Exception as state_update_err:
                     logger.error(f"Failed to update lobby state to DRAFTING for {lobby_id}: {str(state_update_err)}")
                     draft_started = False

            # --- MODIFICATION START: Re-fetch AFTER potential DDB update ---
            # 7. Fetch the absolute latest state FOR BROADCASTING
            final_lobby_item_for_broadcast = None
            if draft_started: # Only refetch if we actually tried to update DDB
                try:
                    logger.info(f"Re-fetching latest lobby state for broadcast after draft start. Lobby: {lobby_id}")
                    # Use ConsistentRead=True to get the state immediately after update
                    final_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                    final_lobby_item_for_broadcast = final_response.get('Item')
                    if not final_lobby_item_for_broadcast:
                         logger.error(f"Critical error: Failed to re-fetch lobby {lobby_id} IMMEDIATELY after DDB update.")
                         # Fallback or error handling needed? For now, maybe use the previously fetched item.
                         final_lobby_item_for_broadcast = updated_lobby_item # Fallback, might be slightly stale if error above
                except Exception as final_fetch_err:
                     logger.error(f"Error re-fetching final lobby state for broadcast: {str(final_fetch_err)}")
                     final_lobby_item_for_broadcast = updated_lobby_item # Fallback
            else:
                 # If draft didn't start, the state we fetched after ready update is still current
                 final_lobby_item_for_broadcast = updated_lobby_item
                 logger.info("Draft did not start, using previously fetched state for broadcast.")

            if not final_lobby_item_for_broadcast:
                 # Should not happen if logic above is correct, but handle defensively
                 logger.error(f"Failed to determine final lobby state for broadcast. Lobby {lobby_id}")
                 return {'statusCode': 500, 'body': 'Internal error preparing broadcast state.'}

            # --- END MODIFICATION ---

            # 8. Construct the broadcast payload using the FINAL fetched item
            state_payload = {
                "type": "lobbyStateUpdate",
                "lobbyId": lobby_id,
                # --- MODIFICATION: Use final_lobby_item_for_broadcast consistently ---
                "hostName": final_lobby_item_for_broadcast.get('hostName'),
                "player1Name": final_lobby_item_for_broadcast.get('player1Name'),
                "player2Name": final_lobby_item_for_broadcast.get('player2Name'),
                "lobbyState": final_lobby_item_for_broadcast.get('lobbyState'), # Read final state
                "player1Ready": final_lobby_item_for_broadcast.get('player1Ready', False), # Read final state
                "player2Ready": final_lobby_item_for_broadcast.get('player2Ready', False), # Read final state
                "currentPhase": final_lobby_item_for_broadcast.get('currentPhase'), # Read final state
                "currentTurn": final_lobby_item_for_broadcast.get('currentTurn'),   # Read final state
                "bans": final_lobby_item_for_broadcast.get('bans', []),
                "player1Picks": final_lobby_item_for_broadcast.get('player1Picks', []),
                "player2Picks": final_lobby_item_for_broadcast.get('player2Picks', []),
                "availableResonators": final_lobby_item_for_broadcast.get('availableResonators', []), # Read final state
                "turnExpiresAt": final_lobby_item_for_broadcast.get('turnExpiresAt') # Add turn expiry time
            }
            logger.info(f"Broadcasting FINAL lobby state update: {state_payload}")

            # 9. Broadcast to all participants
            participants = [
                final_lobby_item_for_broadcast.get('hostConnectionId'),
                final_lobby_item_for_broadcast.get('player1ConnectionId'),
                final_lobby_item_for_broadcast.get('player2ConnectionId')
            ]
            valid_connection_ids = [pid for pid in participants if pid]
            failed_sends = []
            for recipient_id in valid_connection_ids:
                if not send_message_to_client(apigw_management_client, recipient_id, state_payload):
                     failed_sends.append(recipient_id)
            if failed_sends:
                 logger.warning(f"Failed to send state update to some connections: {failed_sends}")

            return {'statusCode': 200, 'body': 'Player readiness updated.'}

        # --- ADD makeBan HANDLER ---
        elif action == 'makeBan':
            # --- ADD THIS LOGGING ---
            connection_id = event.get('requestContext', {}).get('connectionId')
            logger.info(f"--- !!! Entered 'makeBan' action block !!! --- Connection: {connection_id}")
            logger.info(f"DEBUG: 'makeBan' received message data: {message_data}")
            # --- END LOGGING ---

            resonator_name = message_data.get('resonatorName')
            if not resonator_name:
                logger.error(f"'makeBan' request from {connection_id} missing 'resonatorName'.")
                return {'statusCode': 400, 'body': 'Missing resonatorName in request.'}
            logger.info(f"Received resonatorName: {resonator_name}")
            lobby_id = None
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
            lobby_item = None
            if lobby_id:
                try:
                    # Use ConsistentRead for validation
                    response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                    lobby_item = response.get('Item')
                    if not lobby_item:
                        logger.warning(f"Lobby {lobby_id} not found for makeBan.")
                        return {'statusCode': 404, 'body': 'Lobby data not found.'}
                    logger.info(f"Fetched lobby_item for {lobby_id}. Current turn: {lobby_item.get('currentTurn')}")
                except Exception as e:
                     logger.error(f"Failed to get lobby {lobby_id}: {str(e)}")
                     return {'statusCode': 500, 'body': 'Error fetching lobby data.'}
            else:
                 logger.error(f"Cannot fetch lobby item because lobby_id is missing for connection {connection_id}")
                 return {'statusCode': 500, 'body': 'Internal error: lobby_id missing.'}

            # --- Step 2: Validation (Should be uncommented) ---
            current_phase = lobby_item.get('currentPhase')
            current_turn = lobby_item.get('currentTurn')
            lobby_state = lobby_item.get('lobbyState')
            available_resonators = lobby_item.get('availableResonators', [])
            player1_conn_id = lobby_item.get('player1ConnectionId')
            player2_conn_id = lobby_item.get('player2ConnectionId')

            # a) Check if drafting is in progress
            if lobby_state != 'DRAFTING':
                logger.warning(f"Ban attempt in lobby {lobby_id} which is not in DRAFTING state ({lobby_state}).")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Draft is not active."})
                return {'statusCode': 400, 'body': 'Draft not active.'}

            # b) Check if it's a banning phase
            if not current_phase or not current_phase.startswith('BAN'):
                logger.warning(f"Ban attempt in lobby {lobby_id} during non-ban phase ({current_phase}).")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Cannot ban during phase: {current_phase}."})
                return {'statusCode': 400, 'body': 'Not a banning phase.'}

            # c) Check if it's the sender's turn
            player_making_ban = None
            if connection_id == player1_conn_id:
                player_making_ban = 'P1'
            elif connection_id == player2_conn_id:
                player_making_ban = 'P2'

            if player_making_ban != current_turn:
                logger.warning(f"Ban attempt in lobby {lobby_id} by {player_making_ban} ({connection_id}) but it's {current_turn}'s turn.")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Not your turn."})
                return {'statusCode': 400, 'body': 'Not your turn.'}

            # d) Check if the resonator is available
            if resonator_name not in available_resonators:
                logger.warning(f"Ban attempt in lobby {lobby_id} for unavailable resonator '{resonator_name}'. Available: {available_resonators}")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Resonator '{resonator_name}' is not available."})
                return {'statusCode': 400, 'body': 'Resonator not available.'}

            # --- Validation Passed ---
            logger.info(f"Validation passed for ban of '{resonator_name}' by {current_turn} in lobby {lobby_id}, phase {current_phase}.")
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
                 logger.error(f"Invalid currentStepIndex '{current_step_index_decimal}' retrieved from lobby {lobby_id}. Error: {e}")
                 return {'statusCode': 500, 'body': 'Internal error: Invalid draft step index.'}
            # --- END ADDITION ---

            # Check if index is valid before proceeding (it might be -1 if draft never initialized index)
            if current_step_index < 0: # Check less than 0 to catch default -1
                 logger.error(f"Cannot determine next state for lobby {lobby_id}: currentStepIndex is invalid ({current_step_index}).")
                 return {'statusCode': 500, 'body': 'Internal error: Invalid draft step index state.'}

            # Now call determine_next_state with the guaranteed integer index
            next_phase, next_turn, next_step_index = determine_next_state(current_step_index)

            # 6. *** Update DynamoDB (with index and timer) ***
            try:
                new_available_list = [res for res in available_resonators if res != resonator_name]

                # --- Calculate expiry for the NEXT turn ---
                turn_expires_at_iso = None
                if next_turn: # Only set expiry if there is a next turn
                    now = datetime.now(timezone.utc)
                    expires_at_dt = now + timedelta(seconds=TURN_DURATION_SECONDS)
                    turn_expires_at_iso = expires_at_dt.isoformat()
                logger.info(f"Setting next turn expiry for lobby {lobby_id} to: {turn_expires_at_iso}")
                # --- End Calculation ---

                # Define parameters for update_item
                update_expression_string = """
                    SET bans = list_append(if_not_exists(bans, :empty_list), :new_ban),
                        availableResonators = :new_available,
                        currentPhase = :next_phase,
                        currentTurn = :next_turn,
                        currentStepIndex = :next_index,
                        turnExpiresAt = :expires
                """
                expression_attribute_values_dict = {
                    ':empty_list': [],
                    ':new_ban': [resonator_name],
                    ':new_available': new_available_list,
                    ':next_phase': next_phase,
                    ':next_turn': next_turn,
                    ':next_index': next_step_index,
                    ':expected_index': current_step_index,
                    ':expires': turn_expires_at_iso
                }
                condition_expression_string = "currentStepIndex = :expected_index"

                # --- ADD LOGGING HERE ---
                logger.info(f"UpdateItem Params for lobby {lobby_id} (ban):")
                logger.info(f"  UpdateExpression: {update_expression_string}")
                logger.info(f"  ConditionExpression: {condition_expression_string}")
                logger.info(f"  ExpressionAttributeValues: {json.dumps(expression_attribute_values_dict)}")
                # --- END LOGGING ---

                logger.info(f"Attempting to update lobby {lobby_id} state in DynamoDB (using index).")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression_string,
                    ConditionExpression=condition_expression_string,
                    ExpressionAttributeValues=expression_attribute_values_dict
                )

            except ClientError as e:
                if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                    logger.warning(f"Conditional check failed for ban update in lobby {lobby_id}. State likely changed. Index={current_step_index}")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Action failed, state may have changed. Please wait for update."})
                    return {'statusCode': 409, 'body': 'Conflict, state changed during request.'} # 409 Conflict
                else:
                    logger.error(f"Failed to update lobby {lobby_id} after ban: {str(e)}")
                    return {'statusCode': 500, 'body': 'Failed to update lobby state.'}
            except Exception as e:
                 logger.error(f"Unexpected error updating lobby {lobby_id} after ban: {str(e)}")
                 return {'statusCode': 500, 'body': 'Internal server error during update.'}

            # 7. *** Fetch Final State and Broadcast ***
            try:
                # Fetch the absolute latest state FOR BROADCASTING using ConsistentRead
                logger.info(f"Fetching final lobby state for broadcast after ban. Lobby: {lobby_id}")
                final_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                final_lobby_item_for_broadcast = final_response.get('Item')

                if not final_lobby_item_for_broadcast:
                     logger.error(f"Critical error: Failed to re-fetch lobby {lobby_id} for broadcast after ban.")
                     return {'statusCode': 500, 'body': 'Internal error preparing broadcast state.'}

                # Construct the broadcast payload (Ensure all relevant fields are included)
                state_payload = {
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
                    "lastAction": f'{current_turn} banned {resonator_name}'
                }
                logger.info(f"Broadcasting FINAL lobby state update after ban: {json.dumps(state_payload)}")

                # Broadcast to all participants
                participants = [
                    final_lobby_item_for_broadcast.get('hostConnectionId'),
                    final_lobby_item_for_broadcast.get('player1ConnectionId'),
                    final_lobby_item_for_broadcast.get('player2ConnectionId')
                ]
                valid_connection_ids = [pid for pid in participants if pid]
                failed_sends = []
                for recipient_id in valid_connection_ids:
                    if not send_message_to_client(apigw_management_client, recipient_id, state_payload):
                        failed_sends.append(recipient_id)
                
                if failed_sends:
                    logger.warning(f"Failed to send state update to some connections: {failed_sends}")

            except Exception as broadcast_err:
                 logger.error(f"Error broadcasting lobby state update after ban for {lobby_id}: {str(broadcast_err)}")
                 # Don't necessarily fail the operation, but log the error. DB update succeeded.

            # --- Final Success Return ---
            return {'statusCode': 200, 'body': 'Ban processed successfully.'}
            # --- END Final Return ---

        # --- ADD makePick HANDLER ---
        elif action == 'makePick':
            # --- ADD THIS LOGGING ---
            connection_id = event.get('requestContext', {}).get('connectionId')
            logger.info(f"--- !!! Entered 'makePick' action block !!! --- Connection: {connection_id}")
            logger.info(f"DEBUG: 'makePick' received message data: {message_data}")
            # --- END LOGGING ---

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
            next_phase, next_turn, next_step_index = determine_next_state(current_step_index)

            # 6. *** Update DynamoDB (with index and timer) ***
            try:
                new_available_list = [res for res in available_resonators if res != resonator_name]

                # --- Calculate expiry for the NEXT turn ---
                turn_expires_at_iso = None
                if next_turn: # Only set expiry if there is a next turn
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
                            turnExpiresAt = :expires
                    """
                    expression_attribute_values_dict = {
                        ':empty_list': [],
                        ':new_pick_p1': [resonator_name],
                        ':new_available': new_available_list,
                        ':next_phase': next_phase,
                        ':next_turn': next_turn,
                        ':next_index': next_step_index,
                        ':expected_index': current_step_index,
                        ':expires': turn_expires_at_iso
                    }
                elif current_turn == 'P2':
                    player_pick_list_key = ":new_pick_p2"
                    update_expression_string = """
                        SET player2Picks = list_append(if_not_exists(player2Picks, :empty_list), :new_pick_p2),
                            availableResonators = :new_available,
                            currentPhase = :next_phase,
                            currentTurn = :next_turn,
                            currentStepIndex = :next_index,
                            turnExpiresAt = :expires
                    """
                    expression_attribute_values_dict = {
                        ':empty_list': [],
                        ':new_pick_p2': [resonator_name],
                        ':new_available': new_available_list,
                        ':next_phase': next_phase,
                        ':next_turn': next_turn,
                        ':next_index': next_step_index,
                        ':expected_index': current_step_index,
                        ':expires': turn_expires_at_iso
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
                logger.info(f"  ExpressionAttributeValues: {json.dumps(expression_attribute_values_dict)}")
                # --- END LOGGING ---

                logger.info(f"Attempting to update lobby {lobby_id} state in DynamoDB for {current_turn} pick (using index).")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression_string,
                    ConditionExpression=condition_expression_string,
                    ExpressionAttributeValues=expression_attribute_values_dict
                )

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
            # --- End of Step 3 ---

            # --- Step 4: Fetch Final State and Broadcast ---
            try:
                # Fetch the absolute latest state FOR BROADCASTING using ConsistentRead
                logger.info(f"Fetching final lobby state for broadcast after pick. Lobby: {lobby_id}")
                final_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                final_lobby_item_for_broadcast = final_response.get('Item')

                if not final_lobby_item_for_broadcast:
                     logger.error(f"Critical error: Failed to re-fetch lobby {lobby_id} for broadcast after pick.")
                     return {'statusCode': 500, 'body': 'Internal error preparing broadcast state.'}

                # Construct the broadcast payload (Ensure all relevant fields are included)
                state_payload = {
                    "type": "lobbyStateUpdate",
                    "lobbyId": lobby_id,
                    "hostName": final_lobby_item_for_broadcast.get('hostName'),
                    "player1Name": final_lobby_item_for_broadcast.get('player1Name'),
                    "player2Name": final_lobby_item_for_broadcast.get('player2Name'),
                    "currentPhase": final_lobby_item_for_broadcast.get('currentPhase'),
                    "currentTurn": final_lobby_item_for_broadcast.get('currentTurn'),
                    "bans": final_lobby_item_for_broadcast.get('bans', []),
                    "player1Picks": final_lobby_item_for_broadcast.get('player1Picks', []),
                    "player2Picks": final_lobby_item_for_broadcast.get('player2Picks', []),
                    "availableResonators": final_lobby_item_for_broadcast.get('availableResonators', []),
                    "turnExpiresAt": final_lobby_item_for_broadcast.get('turnExpiresAt'),
                    "lastAction": f'{current_turn} picked {resonator_name}'
                }

                logger.info(f"Broadcasting FINAL lobby state update after pick: {json.dumps(state_payload)}")
                
                # Get all participants
                participants = []
                try:
                    response = connections_table.scan(
                        FilterExpression=Attr('currentLobbyId').eq(lobby_id)
                    )
                    participants = response.get('Items', [])
                except Exception as e:
                    logger.error(f"Error fetching participants for broadcast: {str(e)}")
                    return {'statusCode': 500, 'body': 'Error fetching participants for broadcast.'}

                # Send to all valid connections
                valid_connection_ids = [p['connectionId'] for p in participants if 'connectionId' in p]
                failed_sends = []
                for recipient_id in valid_connection_ids:
                    if not send_message_to_client(apigw_management_client, recipient_id, state_payload):
                        failed_sends.append(recipient_id)
                
                if failed_sends:
                    logger.warning(f"Failed to send pick update to some participants: {failed_sends}")

            except Exception as broadcast_err:
                 logger.error(f"Error broadcasting lobby state update after pick for {lobby_id}: {str(broadcast_err)}")

            return {'statusCode': 200, 'body': 'Pick processed successfully.'}
            # --- END Final Return ---

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
            now_iso = datetime.now(timezone.utc).isoformat()
            if not turn_expires_at_db:
                 logger.warning(f"Timeout processing failed for lobby {lobby_id}. Missing turnExpiresAt attribute.")
                 return {'statusCode': 500, 'body': 'Internal error: Missing expiry data.'}
            elif now_iso <= turn_expires_at_db: # Check if current time is BEFORE or EQUAL to expiry
                 logger.warning(f"Timeout check failed for lobby {lobby_id}. Expiry {turn_expires_at_db} has not passed yet ({now_iso}). Client timer might be fast or message delayed.")
                 return {'statusCode': 400, 'body': 'Timeout condition not met (time has not passed).'}
            # If we reach here, time HAS passed
            logger.info(f"Timeout time condition met for lobby {lobby_id}. Expiry: {turn_expires_at_db}, Current: {now_iso}.")
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
            next_phase, next_turn, next_step_index = determine_next_state(current_step_index) # Use int version

            # 6. *** Update DynamoDB ***
            try:
                new_available_list = [res for res in available_resonators if res != random_choice]
                turn_expires_at_iso = None # Calculate expiry for the NEW turn
                if next_turn:
                    now = datetime.now(timezone.utc)
                    expires_at_dt = now + timedelta(seconds=TURN_DURATION_SECONDS)
                    turn_expires_at_iso = expires_at_dt.isoformat()
                logger.info(f"Setting next turn expiry (after timeout) for lobby {lobby_id} to: {turn_expires_at_iso}")

                update_expression = ""
                expression_attribute_values = {}

                base_update = """
                    SET availableResonators = :new_available,
                        currentPhase = :next_phase,
                        currentTurn = :next_turn,
                        currentStepIndex = :next_index,
                        turnExpiresAt = :expires
                """
                base_values = {
                    ':new_available': new_available_list,
                    ':next_phase': next_phase,
                    ':next_turn': next_turn,
                    ':next_index': next_step_index,
                    ':expires': turn_expires_at_iso,
                    ':expected_index': current_step_index # Use the int version here
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

                logger.info(f"Attempting to update lobby {lobby_id} state after timeout.")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression,
                    ConditionExpression="currentStepIndex = :expected_index", # Check against expected int index
                    ExpressionAttributeValues=expression_attribute_values
                )
                logger.info(f"Successfully updated lobby {lobby_id} state after timeout.")

            except ClientError as e:
                if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                    logger.warning(f"Conditional check failed for lobby {lobby_id} during timeout update. State may have changed.")
                    return {'statusCode': 409, 'body': 'State changed during timeout processing.'}
                else:
                    logger.error(f"Failed to update lobby {lobby_id} after timeout (ClientError): {str(e)}")
                    return {'statusCode': 500, 'body': 'Failed to update lobby state after timeout.'}
            except Exception as e:
                 logger.error(f"Unexpected error updating lobby {lobby_id} after timeout: {str(e)}")
                 return {'statusCode': 500, 'body': 'Internal server error during timeout update.'}

            # 7. *** Fetch Final State and Broadcast ***
            try:
                logger.info(f"Fetching final lobby state for broadcast after timeout. Lobby: {lobby_id}")
                final_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                final_lobby_item_for_broadcast = final_response.get('Item')
                if not final_lobby_item_for_broadcast:
                    logger.error(f"Failed to fetch final state for broadcast after timeout. Lobby: {lobby_id}")
                    return {'statusCode': 500, 'body': 'Failed to fetch final state for broadcast.'}

                state_payload = {
                    "type": "lobbyStateUpdate",
                    "lobbyId": lobby_id,
                    "hostName": final_lobby_item_for_broadcast.get('hostName'),
                    "player1Name": final_lobby_item_for_broadcast.get('player1Name'),
                    "player2Name": final_lobby_item_for_broadcast.get('player2Name'),
                    "currentPhase": final_lobby_item_for_broadcast.get('currentPhase'),
                    "currentTurn": final_lobby_item_for_broadcast.get('currentTurn'),
                    "bans": final_lobby_item_for_broadcast.get('bans', []),
                    "player1Picks": final_lobby_item_for_broadcast.get('player1Picks', []),
                    "player2Picks": final_lobby_item_for_broadcast.get('player2Picks', []),
                    "availableResonators": final_lobby_item_for_broadcast.get('availableResonators', []),
                    "turnExpiresAt": final_lobby_item_for_broadcast.get('turnExpiresAt'),
                    "lastAction": f'{timed_out_player} timed out, randomly {action_taken} {random_choice}'
                }

                logger.info(f"Broadcasting FINAL lobby state update after timeout: {json.dumps(state_payload)}")
                
                # Get all participants
                participants = []
                try:
                    response = connections_table.scan(
                        FilterExpression=Attr('currentLobbyId').eq(lobby_id)
                    )
                    participants = response.get('Items', [])
                except Exception as e:
                    logger.error(f"Error fetching participants for broadcast: {str(e)}")
                    return {'statusCode': 500, 'body': 'Error fetching participants for broadcast.'}

                # Send to all valid connections
                valid_connection_ids = [p['connectionId'] for p in participants if 'connectionId' in p]
                failed_sends = []
                for recipient_id in valid_connection_ids:
                    if not send_message_to_client(apigw_management_client, recipient_id, state_payload):
                        failed_sends.append(recipient_id)
                
                if failed_sends:
                    logger.warning(f"Failed to send timeout update to some participants: {failed_sends}")

            except Exception as broadcast_err:
                 logger.error(f"Error broadcasting lobby state update after timeout for {lobby_id}: {str(broadcast_err)}")

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
                last_action_msg = None

                # Determine which slot is leaving
                if connection_id == player1_conn_id:
                    leaving_player_slot = 'P1'
                    leaving_player_name = lobby_item.get('player1Name', 'Player 1')
                    remove_expressions.extend(["player1ConnectionId", "player1Name"])
                   # update_expressions.append("player1Ready = :falseVal")
                   # expression_values[':falseVal'] = False
                elif connection_id == player2_conn_id:
                    leaving_player_slot = 'P2'
                    leaving_player_name = lobby_item.get('player2Name', 'Player 2')
                    remove_expressions.extend(["player2ConnectionId", "player2Name"])
                   # update_expressions.append("player2Ready = :falseVal")
                   # expression_values[':falseVal'] = False
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
                        "player1Ready = :falseVal", # Ensure both are false again
                        "player2Ready = :falseVal",
                        "lastAction = :lastAct"
                    ])
                    remove_expressions.extend([ # Remove all draft-specific fields
                        "currentPhase", "currentTurn", "currentStepIndex",
                        "turnExpiresAt", "bans", "player1Picks",
                        "player2Picks", "availableResonators"
                    ])
                    expression_values[':waitState'] = 'WAITING'
                    expression_values[':falseVal'] = False # Already set but needed if only one SET was added above
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

                # Construct final UpdateExpression
                final_update_expr = ""
                if update_expressions:
                    final_update_expr += "SET " + ", ".join(update_expressions)
                if remove_expressions:
                    if final_update_expr: final_update_expr += " " # Add space if SET exists
                    final_update_expr += "REMOVE " + ", ".join(remove_expressions)

                # Update the Lobby Item if there are changes
                if final_update_expr:
                    logger.info(f"Updating lobby {lobby_id}. Update: {final_update_expr}, Values: {expression_values}")
                    lobbies_table.update_item(
                         Key={'lobbyId': lobby_id},
                         UpdateExpression=final_update_expr,
                         ExpressionAttributeValues=expression_values
                         # No ConditionExpression needed here generally
                    )
                else:
                    logger.warning(f"No update expression generated for leaveLobby in lobby {lobby_id}.")


                # Update the leaving connection's item to remove lobby association
                try:
                     connections_table.update_item(
                         Key={'connectionId': connection_id},
                         UpdateExpression="REMOVE currentLobbyId"
                     )
                     logger.info(f"Removed currentLobbyId from connection {connection_id}")
                except Exception as conn_update_err:
                     logger.error(f"Failed to remove lobbyId from connection {connection_id}: {conn_update_err}")


                # Broadcast the updated state to REMAINING participants
                broadcast_lobby_state(lobby_id, apigw_management_client, last_action=last_action_msg, exclude_connection_id=connection_id)

                return {'statusCode': 200, 'body': 'Player left successfully.'}

            except Exception as e:
                logger.error(f"Error processing leaveLobby for {connection_id} in lobby {lobby_id}: {str(e)}", exc_info=True)
                # Don't try to send error to leaving client
                return {'statusCode': 500, 'body': 'Failed to process leave request.'}
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
                target_conn_id_key = f"player{player_slot_to_kick[1]}ConnectionId"
                target_name_key = f"player{player_slot_to_kick[1]}Name"
                target_ready_key = f"player{player_slot_to_kick[1]}Ready"
                kicked_connection_id = lobby_item.get(target_conn_id_key)
                kicked_player_name = lobby_item.get(target_name_key, player_slot_to_kick) # Default name if missing

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

                # Update lobby item to remove the player
                logger.info(f"Preparing to update lobby {lobby_id} to remove {player_slot_to_kick}.")
                last_action_msg = f"Host kicked {kicked_player_name}."
                
                # Use REMOVE to completely clear the fields
                update_expression = f"REMOVE {target_conn_id_key}, {target_name_key} SET {target_ready_key} = :falseVal, lastAction = :lastAct"
                expression_values = {
                    ':falseVal': False,
                    ':lastAct': last_action_msg,
                    ':kick_conn_id': kicked_connection_id # Value for condition check
                }
                # Condition ensures we only kick the player currently in that slot
                condition_expression = f"attribute_exists({target_conn_id_key}) AND {target_conn_id_key} = :kick_conn_id"

                logger.info(f"Attempting UpdateItem for kick. Update: {update_expression}, Condition: {condition_expression}, Values: {expression_values}")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression,
                    ConditionExpression=condition_expression,
                    ExpressionAttributeValues=expression_values
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
                update_expression = """
                    SET lobbyState = :waitState,
                        player1Ready = :falseVal,
                        player2Ready = :falseVal,
                        lastAction = :lastAct
                    REMOVE currentPhase, currentTurn, currentStepIndex, turnExpiresAt,
                           bans, player1Picks, player2Picks, availableResonators
                """
                expression_values = {
                    ':waitState': 'WAITING',
                    ':falseVal': False,
                    ':lastAct': last_action_msg
                }

                logger.info(f"Resetting draft for lobby {lobby_id}. Update: {update_expression}, Values: {expression_values}")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression,
                    ExpressionAttributeValues=expression_values
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

            try:
                # Get lobby item (ConsistentRead recommended)
                response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
                lobby_item = response.get('Item')
                if not lobby_item:
                    logger.warning(f"Lobby {lobby_id} not found for hostLeaveSlot by {connection_id}.")
                    return {'statusCode': 404, 'body': 'Lobby not found.'}

                # Verify requester is the host
                host_connection_id = lobby_item.get('hostConnectionId')
                if connection_id != host_connection_id:
                    logger.warning(f"Unauthorized hostLeaveSlot attempt on lobby {lobby_id} by non-host {connection_id}.")
                    # Send error back to prevent unexpected UI state if non-host clicks somehow
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Only the host can perform this action."})
                    return {'statusCode': 403, 'body': 'Forbidden: Not the host.'}

                # Find which slot the host occupies
                host_slot_key = None
                host_name_key = None
                host_ready_key = None
                if lobby_item.get('player1ConnectionId') == host_connection_id:
                    host_slot_key = 'player1ConnectionId'
                    host_name_key = 'player1Name'
                    host_ready_key = 'player1Ready'
                elif lobby_item.get('player2ConnectionId') == host_connection_id:
                    host_slot_key = 'player2ConnectionId'
                    host_name_key = 'player2Name'
                    host_ready_key = 'player2Ready'
                else:
                    logger.warning(f"Host {connection_id} tried to leave slot in lobby {lobby_id}, but is not currently in a player slot.")
                    send_message_to_client(apigw_management_client, connection_id, {"type": "info", "message": "You are not currently in a player slot."})
                    return {'statusCode': 400, 'body': 'Host not in a player slot.'}

                # Prepare update to remove host from slot
                last_action_msg = f"{lobby_item.get('hostName', 'Host')} left the player slot."
                update_expression = f"REMOVE {host_slot_key}, {host_name_key} SET {host_ready_key} = :falseVal, lastAction = :lastAct"
                expression_values = {
                    ':falseVal': False,
                    ':lastAct': last_action_msg,
                    ':host_conn_id': host_connection_id # Value for condition
                }
                # Condition ensures we only remove if the host is still in that specific slot
                condition_expression = f"{host_slot_key} = :host_conn_id"

                logger.info(f"Host {connection_id} leaving slot. Update: {update_expression}, Condition: {condition_expression}")
                lobbies_table.update_item(
                    Key={'lobbyId': lobby_id},
                    UpdateExpression=update_expression,
                    ConditionExpression=condition_expression,
                    ExpressionAttributeValues=expression_values
                )
                logger.info(f"Lobby {lobby_id} updated successfully (host left slot).")

                # Send lobbyJoined message back to host to update their state *immediately*
                # This ensures their state.myAssignedSlot becomes null quickly.
                send_message_to_client(apigw_management_client, connection_id, {
                    "type": "lobbyJoined", # Re-use lobbyJoined type
                    "lobbyId": lobby_id,
                    "assignedSlot": None, # Explicitly set slot to None
                    "isHost": True,
                    "message": "You left the player slot."
                })

                # Broadcast the updated state to all participants (including host)
                broadcast_lobby_state(lobby_id, apigw_management_client, last_action=last_action_msg)

                return {'statusCode': 200, 'body': 'Host left slot successfully.'}

            except ClientError as e:
                if e.response['Error']['Code'] == 'ConditionalCheckFailedException':
                    logger.warning(f"Conditional check failed for hostLeaveSlot in lobby {lobby_id}. Host might have already left.")
                    # Maybe broadcast current state? Or just let host UI update from subsequent broadcast.
                    broadcast_lobby_state(lobby_id, apigw_management_client) # Ensure everyone gets latest state
                    return {'statusCode': 409, 'body': 'Conflict, slot state changed.'}
                else:
                    logger.error(f"Error processing hostLeaveSlot (ClientError): {str(e)}", exc_info=True)
                    send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": "Database error leaving slot."})
                    return {'statusCode': 500, 'body': 'Failed to leave slot (database error).'}
            except Exception as e:
                logger.error(f"Error processing hostLeaveSlot for {connection_id} on lobby {lobby_id}: {str(e)}", exc_info=True)
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Failed to leave slot: {str(e)}"})
                return {'statusCode': 500, 'body': 'Failed to leave slot.'}
        # --- END hostLeaveSlot Handler ---

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
        logger.error(f"Error processing action '{action}' for {connection_id}: {str(e)}", exc_info=True)
        send_message_to_client(apigw_management_client, connection_id, {
            "type": "error",
            "message": f"Failed to process action '{action}': {str(e)}"
        })
        return {'statusCode': 500, 'body': f'Failed to process action {action}.'}