# backend/defaultHandler/app.py

import json
import boto3
import logging
import os
import uuid # Import uuid library for generating unique IDs
from datetime import datetime, timezone, timedelta # For timestamps and timedelta
from boto3.dynamodb.conditions import Key, Attr # Keep this if needed elsewhere
from botocore.exceptions import ClientError # Remove ConditionalCheckFailedException from import

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

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
                draft_started = True # Mark that draft state was initialized

                # --- Calculate expiry for the FIRST turn ---
                now = datetime.now(timezone.utc)
                expires_at_dt = now + timedelta(seconds=TURN_DURATION_SECONDS)
                turn_expires_at_iso = expires_at_dt.isoformat()
                logger.info(f"Setting initial turn expiry for lobby {lobby_id} to: {turn_expires_at_iso}")
                # --- End Calculation ---

                # Initialize draft state in DDB
                try:
                    # Define parameters for update_item
                    update_expression_string = """
                        SET lobbyState = :newState,
                            currentPhase = :phase,
                            currentTurn = :turn,
                            bans = :emptyList,
                            player1Picks = :emptyList,
                            player2Picks = :emptyList,
                            availableResonators = :allRes,
                            currentStepIndex = :zero,
                            turnExpiresAt = :expires
                    """
                    expression_attribute_values_dict = {
                        ':newState': current_lobby_state,
                        ':phase': current_phase,
                        ':turn': current_turn,
                        ':emptyList': [],
                        ':allRes': ALL_RESONATOR_NAMES,
                        ':zero': 0,
                        ':expires': turn_expires_at_iso
                    }

                    # --- ADD LOGGING HERE ---
                    logger.info(f"UpdateItem Params for lobby {lobby_id} (draft initialization):")
                    logger.info(f"  UpdateExpression: {update_expression_string}")
                    logger.info(f"  ExpressionAttributeValues: {json.dumps(expression_attribute_values_dict)}")
                    # --- END LOGGING ---

                    lobbies_table.update_item(
                        Key={'lobbyId': lobby_id},
                        UpdateExpression=update_expression_string,
                        ExpressionAttributeValues=expression_attribute_values_dict
                    )
                    logger.info(f"Lobby {lobby_id} state updated to {current_lobby_state} with draft initialization (including turn expiry)")

                except Exception as state_update_err:
                     logger.error(f"Failed to update lobby state to DRAFTING for {lobby_id}: {str(state_update_err)}")
                     # Handle error: maybe reset flag or return error?
                     draft_started = False # Revert flag on error?

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
            logger.info(f"--- Entered 'makeBan' action block ---")

            # Step 1: Initial Data Fetching (Keep uncommented)
            connection_id = event.get('requestContext', {}).get('connectionId')
            logger.info(f"Processing 'makeBan' action for {connection_id}")
            # Assumes message_data is parsed earlier
            resonator_name_to_ban = message_data.get('resonatorName')
            if not resonator_name_to_ban:
                logger.error(f"'makeBan' request from {connection_id} missing 'resonatorName'.")
                return {'statusCode': 400, 'body': 'Missing resonatorName in request.'}
            logger.info(f"Received resonatorName: {resonator_name_to_ban}")
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
            # --- End of Step 1 ---

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
            if resonator_name_to_ban not in available_resonators:
                logger.warning(f"Ban attempt in lobby {lobby_id} for unavailable resonator '{resonator_name_to_ban}'. Available: {available_resonators}")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Resonator '{resonator_name_to_ban}' is not available."})
                return {'statusCode': 400, 'body': 'Resonator not available.'}

            # --- Validation Passed ---
            logger.info(f"Validation passed for ban of '{resonator_name_to_ban}' by {current_turn} in lobby {lobby_id}, phase {current_phase}.")
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
                new_available_list = [res for res in available_resonators if res != resonator_name_to_ban]

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
                    ':new_ban': [resonator_name_to_ban],
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
                    "turnExpiresAt": final_lobby_item_for_broadcast.get('turnExpiresAt') # Add turn expiry time
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
            logger.info(f"--- Entered 'makePick' action block ---")

            # Step 1: Initial Data Fetching (Keep uncommented)
            connection_id = event.get('requestContext', {}).get('connectionId')
            logger.info(f"Processing 'makePick' action for {connection_id}")
            # Assumes message_data is parsed earlier
            resonator_name_to_pick = message_data.get('resonatorName')
            if not resonator_name_to_pick:
                logger.error(f"'makePick' request from {connection_id} missing 'resonatorName'.")
                return {'statusCode': 400, 'body': 'Missing resonatorName in request.'}
            logger.info(f"Received resonatorName: {resonator_name_to_pick}")
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
            # --- End of Step 1 ---

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
            if resonator_name_to_pick not in available_resonators:
                logger.warning(f"Pick attempt in lobby {lobby_id} for unavailable resonator '{resonator_name_to_pick}'. Available: {available_resonators}")
                send_message_to_client(apigw_management_client, connection_id, {"type": "error", "message": f"Resonator '{resonator_name_to_pick}' is not available."})
                return {'statusCode': 400, 'body': 'Resonator not available.'}

            # --- Validation Passed ---
            logger.info(f"Validation passed for pick of '{resonator_name_to_pick}' by {current_turn} in lobby {lobby_id}, phase {current_phase}.")
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
                new_available_list = [res for res in available_resonators if res != resonator_name_to_pick]

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
                        ':new_pick_p1': [resonator_name_to_pick],
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
                        ':new_pick_p2': [resonator_name_to_pick],
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
                    "lobbyState": final_lobby_item_for_broadcast.get('lobbyState'),
                    "player1Ready": final_lobby_item_for_broadcast.get('player1Ready', False),
                    "player2Ready": final_lobby_item_for_broadcast.get('player2Ready', False),
                    "currentPhase": final_lobby_item_for_broadcast.get('currentPhase'),
                    "currentTurn": final_lobby_item_for_broadcast.get('currentTurn'),
                    "bans": final_lobby_item_for_broadcast.get('bans', []),
                    "player1Picks": final_lobby_item_for_broadcast.get('player1Picks', []),
                    "player2Picks": final_lobby_item_for_broadcast.get('player2Picks', []),
                    "availableResonators": final_lobby_item_for_broadcast.get('availableResonators', []),
                    "turnExpiresAt": final_lobby_item_for_broadcast.get('turnExpiresAt') # Add turn expiry time
                }
                logger.info(f"Broadcasting FINAL lobby state update after pick: {json.dumps(state_payload)}")

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
                 logger.error(f"Error broadcasting lobby state update after pick for {lobby_id}: {str(broadcast_err)}")
                 # Don't necessarily fail the operation, but log the error. DB update succeeded.

            # --- End of Step 4 ---

            # --- Final Success Return ---
            return {'statusCode': 200, 'body': 'Pick processed successfully.'}
            # --- END Final Return ---
        # --- END makePick HANDLER ---
        # --- PING HANDLER ---
        elif action == 'ping':
            # API Gateway idle timeout resets upon receiving a message.
            # No action needed usually, but we can log it or send pong.
            logger.info(f"Received ping from {connection_id}")
            # Optional: Send pong back
            # send_message_to_client(apigw_management_client, connection_id, {"type": "pong"})
            return {'statusCode': 200, 'body': 'Pong.'}
        # --- END PING HANDLER ---
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