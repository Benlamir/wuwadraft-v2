# backend/defaultHandler/app.py

import json
import boto3
import logging
import os
import uuid # Import uuid library for generating unique IDs
from datetime import datetime, timezone # For timestamps

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- Configuration ---
CONNECTIONS_TABLE_NAME = 'WuwaDraftConnections'
LOBBIES_TABLE_NAME = 'WuwaDraftLobbies' # Use your exact table name
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
    """
    Handles $default route messages. Routes based on 'action' in message body.
    """
    logger.info(f"Received event: {json.dumps(event, indent=2)}")
    connection_id = event.get('requestContext', {}).get('connectionId')
    message_body_str = event.get('body', '{}')

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
                        "lobbyState": updated_lobby_item.get('lobbyState', 'WAITING')
                        # Add other state info here later (picks, bans, turn etc)
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

            current_lobby_state = updated_lobby_item.get('lobbyState', 'WAITING')

            # 6. If both ready, update lobby state to start draft (only if not already started)
            if p1_ready and p2_ready and current_lobby_state == 'WAITING': # Check specific state
                logger.info(f"Both players ready! Updating lobby state to DRAFTING for {lobby_id}")
                current_lobby_state = 'DRAFTING' # Or 'BAN_PHASE_1' etc.
                # TODO: Add logic to determine first turn, initialize draft fields?
                try:
                    lobbies_table.update_item(
                        Key={'lobbyId': lobby_id},
                        UpdateExpression="SET lobbyState = :newState", # Add other fields later
                        ExpressionAttributeValues={':newState': current_lobby_state}
                    )
                    updated_lobby_item['lobbyState'] = current_lobby_state # Reflect change for broadcast
                    logger.info(f"Lobby {lobby_id} state updated to {current_lobby_state}")
                except Exception as state_update_err:
                     logger.error(f"Failed to update lobby state to DRAFTING for {lobby_id}: {str(state_update_err)}")
                     # Continue with broadcast, state will show as WAITING

            # 7. Construct the broadcast payload using the LATEST fetched state
            state_payload = {
                "type": "lobbyStateUpdate",
                "lobbyId": lobby_id,
                "hostName": updated_lobby_item.get('hostName'),
                "player1Name": updated_lobby_item.get('player1Name'),
                "player2Name": updated_lobby_item.get('player2Name'),
                "lobbyState": current_lobby_state, # Use potentially updated state
                "player1Ready": p1_ready, # Use value checked from LATEST state
                "player2Ready": p2_ready # Use value checked from LATEST state
                # Add other state info later
            }
            logger.info(f"Broadcasting lobby state update: {state_payload}")

            # 8. Broadcast to all participants
            participants = [
                updated_lobby_item.get('hostConnectionId'),
                updated_lobby_item.get('player1ConnectionId'),
                updated_lobby_item.get('player2ConnectionId')
            ]
            valid_connection_ids = [pid for pid in participants if pid]
            failed_sends = []
            for recipient_id in valid_connection_ids:
                if not send_message_to_client(apigw_management_client, recipient_id, state_payload):
                     failed_sends.append(recipient_id)
            if failed_sends:
                 logger.warning(f"Failed to send state update to some connections: {failed_sends}")

            return {'statusCode': 200, 'body': 'Player readiness updated.'}

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