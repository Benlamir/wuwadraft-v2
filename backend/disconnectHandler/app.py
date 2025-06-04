# backend/disconnectHandler/app.py

import json
import boto3
import logging
import os
from datetime import datetime, timezone # Keep timezone
from boto3.dynamodb.conditions import Attr # Keep if broadcast_lobby_state uses it (it doesn't directly)
from botocore.exceptions import ClientError
import decimal

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# --- Helper Function (Decimal Encoder) ---
class DecimalEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, decimal.Decimal):
            if obj % 1 == 0:
                return int(obj)
            else:
                # Return as string to preserve precision for floats from DynamoDB
                return str(obj) 
        return json.JSONEncoder.default(self, obj)

# --- DynamoDB Setup ---
CONNECTIONS_TABLE_NAME = os.environ.get('CONNECTIONS_TABLE_NAME', 'WuwaDraftConnections')
LOBBIES_TABLE_NAME = os.environ.get('LOBBIES_TABLE_NAME', 'WuwaDraftLobbies')
dynamodb = boto3.resource('dynamodb')
connections_table = dynamodb.Table(CONNECTIONS_TABLE_NAME)
lobbies_table = dynamodb.Table(LOBBIES_TABLE_NAME)

# --- API Gateway Management Client Helper ---
WEBSOCKET_ENDPOINT_URL = os.environ.get('WEBSOCKET_ENDPOINT_URL', None)

def get_apigw_management_client():
    """Creates an API Gateway Management API client."""
    if not WEBSOCKET_ENDPOINT_URL:
        logger.error("WEBSOCKET_ENDPOINT_URL environment variable not set.")
        raise ValueError("Missing WebSocket endpoint URL configuration.")
    logger.info(f"Creating ApiGatewayManagementApi client with endpoint: {WEBSOCKET_ENDPOINT_URL}")
    return boto3.client('apigatewaymanagementapi', endpoint_url=WEBSOCKET_ENDPOINT_URL)

# --- Send Message Helper ---
# Ensure this uses DecimalEncoder consistently for all payloads from this handler
def send_message_to_client(apigw_client, connection_id, payload_dict):
    """Sends a JSON payload to a specific connectionId, using DecimalEncoder."""
    try:
        payload_json_string = json.dumps(payload_dict, cls=DecimalEncoder)
        logger.info(f"SEND_MSG_CLIENT_DEBUG: Serialized JSON for {connection_id}: {payload_json_string}")
        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=payload_json_string.encode('utf-8')
        )
        logger.info(f"Message sent successfully to {connection_id}")
        return True
    except apigw_client.exceptions.GoneException:
        logger.warning(f"Client {connection_id} is gone. Cannot send message.")
    except Exception as e:
        logger.error(f"Failed to post message to connectionId {connection_id}: {str(e)}", exc_info=True)
    return False

# --- Broadcast Lobby State Helper ---
# Ensure this function includes ALL necessary BSS fields. Your shared version looks good.
def broadcast_lobby_state(lobby_id, apigw_client, last_action=None, exclude_connection_id=None):
    try:
        logger.info(f"BROADCAST_LOBBY_STATE: Fetching item for lobby {lobby_id}. Last Action: {last_action}")
        final_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
        final_lobby_item_for_broadcast = final_response.get('Item')

        if not final_lobby_item_for_broadcast:
            logger.warning(f"BROADCAST_LOBBY_STATE: Cannot broadcast, lobby {lobby_id} item not found.")
            return False

        logger.info(f"BROADCAST_LOBBY_STATE_ITEM_DUMP_DEBUG for lobby {lobby_id}: {json.dumps(final_lobby_item_for_broadcast, cls=DecimalEncoder)}")

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
            "equilibrationEnabled": final_lobby_item_for_broadcast.get('equilibrationEnabled', False), # Default to False if missing
            "player1ScoreSubmitted": final_lobby_item_for_broadcast.get('player1ScoreSubmitted', False),
            "player2ScoreSubmitted": final_lobby_item_for_broadcast.get('player2ScoreSubmitted', False),
            "player1WeightedBoxScore": final_lobby_item_for_broadcast.get('player1WeightedBoxScore'),
            "player2WeightedBoxScore": final_lobby_item_for_broadcast.get('player2WeightedBoxScore'),
            "player1Sequences": final_lobby_item_for_broadcast.get('player1Sequences'),
            "player2Sequences": final_lobby_item_for_broadcast.get('player2Sequences'),
            "effectiveDraftOrder": final_lobby_item_for_broadcast.get('effectiveDraftOrder'),
            "playerRoles": final_lobby_item_for_broadcast.get('playerRoles'),
            "currentEquilibrationBanner": final_lobby_item_for_broadcast.get('currentEquilibrationBanner'), # Added
            "equilibrationBansAllowed": final_lobby_item_for_broadcast.get('equilibrationBansAllowed', 0), # Renamed from equilibrationBansTarget
            "equilibrationBansMade": final_lobby_item_for_broadcast.get('equilibrationBansMade', 0)
        }
        if last_action:
            state_payload["lastAction"] = last_action
        
        logger.info(f"BROADCAST_LOBBY_STATE: Constructed state_payload DICT for lobby {lobby_id} (pre-send): {state_payload}")

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
            # Pass the Python dictionary directly. send_message_to_client handles serialization.
            if send_message_to_client(apigw_client, recipient_id, state_payload):
                 success_count += 1
        
        logger.info(f"Broadcast complete for lobby {lobby_id}. Sent to {success_count} participant(s).")
        return True
    except Exception as broadcast_err:
        logger.error(f"Error during broadcast_lobby_state for {lobby_id}: {str(broadcast_err)}", exc_info=True)
        return False

# --- Main Handler ---
def handler(event, context):
    connection_id = event.get('requestContext', {}).get('connectionId')
    logger.info(f"Disconnect event for connectionId: {connection_id}")

    if not connection_id:
        return {'statusCode': 400, 'body': 'Missing connectionId.'}

    apigw_management_client = None
    if WEBSOCKET_ENDPOINT_URL:
        try:
            apigw_management_client = get_apigw_management_client()
        except ValueError as e:
            logger.error(f"Cannot initialize APIGW client on disconnect: {e}")
    else:
        logger.warning("WEBSOCKET_ENDPOINT_URL not set. Cannot broadcast on disconnect.")

    lobby_id = None
    player_name_for_logging = "Player"
    try:
        response = connections_table.get_item(Key={'connectionId': connection_id})
        connection_item = response.get('Item')
        if connection_item:
            lobby_id = connection_item.get('currentLobbyId')
            player_name_for_logging = connection_item.get('playerName', player_name_for_logging)
            if lobby_id:
                logger.info(f"Connection {connection_id} ({player_name_for_logging}) was in lobby {lobby_id}.")
        else: # connection_item is None
            logger.info(f"Connection {connection_id} not found in connections table (already cleaned or never fully registered).")
            return {'statusCode': 200, 'body': 'Disconnected user not found in connections table.'}
    except Exception as e:
        logger.error(f"Failed to get connection details for {connection_id}: {str(e)}", exc_info=True)
        # Don't return yet, still attempt to delete connection if connection_id is known
    
    try:
        connections_table.delete_item(Key={'connectionId': connection_id})
        logger.info(f"Removed connection {connection_id} from connections table.")
    except Exception as e_del_conn:
        logger.error(f"Failed to delete connection {connection_id} from connections table: {str(e_del_conn)}", exc_info=True)

    if not lobby_id:
        logger.info(f"No lobby associated with {connection_id} in connections table. No lobby updates to perform.")
        return {'statusCode': 200, 'body': 'Connection cleaned up, no lobby associated.'}

    try:
        lobby_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
        lobby_item = lobby_response.get('Item')

        if not lobby_item:
            logger.warning(f"Lobby {lobby_id} (referenced by {connection_id}) not found. No lobby updates needed.")
            return {'statusCode': 200, 'body': 'Connection cleaned up, referenced lobby not found.'}

        current_lobby_state = lobby_item.get('lobbyState')
        host_connection_id = lobby_item.get('hostConnectionId')
        p1_connection_id = lobby_item.get('player1ConnectionId')
        p2_connection_id = lobby_item.get('player2ConnectionId')

        update_expressions = [] # Using your original variable name
        remove_expressions = [] # Using your original variable name
        expression_attribute_values = {':falseVal': False}
        expression_attribute_names = {} # Initialize this
        
        last_action_message = f"{player_name_for_logging} disconnected."
        disconnected_player_slot_prefix = None

        if connection_id == host_connection_id:
            host_name = lobby_item.get('hostName', 'The Host')  # Get host name for message
            logger.info(f"Host ({host_name}) disconnected from lobby {lobby_id}. Preparing to notify players and delete lobby.")

            # 1. Identify remaining participants
            remaining_participant_ids = []
            if p1_connection_id and p1_connection_id != connection_id:  # Ensure P1 is not the host themselves
                remaining_participant_ids.append(p1_connection_id)
            if p2_connection_id and p2_connection_id != connection_id:  # Ensure P2 is not the host themselves
                remaining_participant_ids.append(p2_connection_id)

            # 2. Notify remaining participants
            if apigw_management_client and remaining_participant_ids:
                notification_payload = {
                    "type": "forceRedirect",
                    "reason": "host_disconnected",
                    "message": f"{host_name} has disconnected. The lobby ({lobby_id}) is closing."
                }
                logger.info(f"Notifying remaining players ({remaining_participant_ids}) about host disconnect for lobby {lobby_id}.")
                for pid in remaining_participant_ids:
                    send_message_to_client(apigw_management_client, pid, notification_payload)
            
            # 3. Delete the lobby from DynamoDB
            try:
                lobbies_table.delete_item(Key={'lobbyId': lobby_id})
                logger.info(f"Lobby {lobby_id} deleted due to host disconnect.")
            except Exception as e_del_lobby:
                logger.error(f"Failed to delete lobby {lobby_id} after host disconnect: {str(e_del_lobby)}", exc_info=True)
                # Continue with connection cleanup even if lobby delete fails

            # 4. Clean up connection table entries for remaining players (remove currentLobbyId)
            # This ensures they don't think they are still in a deleted lobby
            for pid in remaining_participant_ids:
                try:
                    connections_table.update_item(
                        Key={'connectionId': pid},
                        UpdateExpression="REMOVE currentLobbyId"
                        # Optionally, add a ConditionExpression if currentLobbyId must match lobby_id
                    )
                    logger.info(f"Removed currentLobbyId from connection {pid} for deleted lobby {lobby_id}.")
                except Exception as e_clean_conn:
                    logger.error(f"Failed to clean currentLobbyId for connection {pid}: {str(e_clean_conn)}")
            
            return {'statusCode': 200, 'body': 'Host disconnected, lobby processed.'}

        elif connection_id == p1_connection_id:
            disconnected_player_slot_prefix = "player1"
            player_name_for_logging = lobby_item.get('player1Name', player_name_for_logging)
        elif connection_id == p2_connection_id:
            disconnected_player_slot_prefix = "player2"
            player_name_for_logging = lobby_item.get('player2Name', player_name_for_logging)
        else:
            logger.info(f"Disconnected user {connection_id} ({player_name_for_logging}) was not an active player in lobby {lobby_id}.")
            if apigw_management_client: # Broadcast a generic disconnect
                 broadcast_lobby_state(lobby_id, apigw_management_client, last_action_message, exclude_connection_id=connection_id)
            return {'statusCode': 200, 'body': 'Non-critical player disconnected.'}
        
        last_action_message = f"{player_name_for_logging} disconnected."

        # --- ALWAYS CLEAN THE SPECIFIC DISCONNECTED PLAYER'S SLOT ---
        if disconnected_player_slot_prefix:
            logger.info(f"Clearing specific slot data for {disconnected_player_slot_prefix} in lobby {lobby_id}.")
            remove_expressions.extend([
                f"{disconnected_player_slot_prefix}ConnectionId",
                f"{disconnected_player_slot_prefix}Name",
                f"{disconnected_player_slot_prefix}Sequences",
                f"{disconnected_player_slot_prefix}WeightedBoxScore"
            ])
            
            # Use ExpressionAttributeNames for all attributes being SET
            rdy_ph = f"#{disconnected_player_slot_prefix}Ready" # e.g. #player1Ready
            sub_ph = f"#{disconnected_player_slot_prefix}ScoreSubmitted" # e.g. #player1ScoreSubmitted
            expression_attribute_names[rdy_ph] = f"{disconnected_player_slot_prefix}Ready"
            expression_attribute_names[sub_ph] = f"{disconnected_player_slot_prefix}ScoreSubmitted"
            
            update_expressions.extend([
                f"{rdy_ph} = :falseVal",
                f"{sub_ph} = :falseVal"
            ])

        # --- CONDITIONAL DRAFT RESET LOGIC ---
        EQUILIBRATION_PHASE_NAME = 'EQUILIBRATE_BANS' # Ensure this constant is available
        PRE_DRAFT_READY_STATE = 'PRE_DRAFT_READY'  # Define the pre-draft ready state constant
        
        if current_lobby_state == 'DRAFTING' or current_lobby_state == EQUILIBRATION_PHASE_NAME:
            logger.info(f"{player_name_for_logging} disconnected during active draft ('{current_lobby_state}') in lobby {lobby_id}. Resetting entire draft.")
            last_action_message = f"{player_name_for_logging} disconnected during {current_lobby_state}. Draft reset."
            
            # Notify remaining participants about the draft disconnect
            if apigw_management_client:
                # Get remaining participant connection IDs
                remaining_participant_ids = []
                if host_connection_id and host_connection_id != connection_id:
                    remaining_participant_ids.append(host_connection_id)
                if p1_connection_id and p1_connection_id != connection_id:
                    remaining_participant_ids.append(p1_connection_id)
                if p2_connection_id and p2_connection_id != connection_id:
                    remaining_participant_ids.append(p2_connection_id)
                
                if remaining_participant_ids:
                    notification_payload = {
                        "type": "alert",
                        "message": f"{player_name_for_logging} disconnected during {current_lobby_state.lower()}. The draft has been reset.",
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                    logger.info(f"Notifying remaining players ({remaining_participant_ids}) about draft disconnect for lobby {lobby_id}.")
                    for pid in remaining_participant_ids:
                        send_message_to_client(apigw_management_client, pid, notification_payload)
            
            # Check if equilibration is enabled to determine what to preserve
            is_equilibration_enabled = lobby_item.get('equilibrationEnabled', False)
            
            # SET operations for full reset (using unique placeholders for ExpressionAttributeNames)
            expression_attribute_names["#LState"] = "lobbyState"
            update_expressions.append("#LState = :waitState")
            expression_attribute_values[':waitState'] = 'WAITING'

            # Reset for P1 if P2 disconnected, or if host reset affects P1
            if disconnected_player_slot_prefix != "player1": # Or always reset for safety if draft is resetting
                expression_attribute_names["#P1RdyReset"] = "player1Ready"
                update_expressions.append("#P1RdyReset = :falseVal")
                # Only reset score submission if equilibration is disabled
                if not is_equilibration_enabled:
                    expression_attribute_names["#P1SubReset"] = "player1ScoreSubmitted"
                    update_expressions.append("#P1SubReset = :falseVal")
            
            # Reset for P2 if P1 disconnected, or if host reset affects P2
            if disconnected_player_slot_prefix != "player2": # Or always reset
                expression_attribute_names["#P2RdyReset"] = "player2Ready"
                update_expressions.append("#P2RdyReset = :falseVal")
                # Only reset score submission if equilibration is disabled
                if not is_equilibration_enabled:
                    expression_attribute_names["#P2SubReset"] = "player2ScoreSubmitted"
                    update_expressions.append("#P2SubReset = :falseVal")
            
            # REMOVE operations for full reset
            remove_expressions.extend([ 
                "currentPhase", "currentTurn", "currentStepIndex", "turnExpiresAt", 
                "bans", "player1Picks", "player2Picks", "availableResonators",
                "effectiveDraftOrder", "playerRoles", 
                "equilibrationBansAllowed", "equilibrationBansMade", "currentEquilibrationBanner"
            ])
            # Only remove score data if equilibration is disabled - preserve for box score submission
            if not is_equilibration_enabled:
                if "player1Sequences" not in remove_expressions: remove_expressions.append("player1Sequences")
                if "player1WeightedBoxScore" not in remove_expressions: remove_expressions.append("player1WeightedBoxScore")
                if "player2Sequences" not in remove_expressions: remove_expressions.append("player2Sequences")
                if "player2WeightedBoxScore" not in remove_expressions: remove_expressions.append("player2WeightedBoxScore")

        elif current_lobby_state == PRE_DRAFT_READY_STATE:
            logger.info(f"{player_name_for_logging} disconnected during PRE_DRAFT_READY state in lobby {lobby_id}. Resetting to WAITING state.")
            last_action_message = f"{player_name_for_logging} disconnected during preparation. Lobby reset to waiting state."
            
            # Notify remaining participants about the pre-draft phase disconnect
            if apigw_management_client:
                # Get remaining participant connection IDs
                remaining_participant_ids = []
                if host_connection_id and host_connection_id != connection_id:
                    remaining_participant_ids.append(host_connection_id)
                if p1_connection_id and p1_connection_id != connection_id:
                    remaining_participant_ids.append(p1_connection_id)
                if p2_connection_id and p2_connection_id != connection_id:
                    remaining_participant_ids.append(p2_connection_id)
                
                if remaining_participant_ids:
                    notification_payload = {
                        "type": "alert",
                        "message": f"{player_name_for_logging} disconnected during pre-draft preparation. The lobby has been reset to waiting state.",
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                    logger.info(f"Notifying remaining players ({remaining_participant_ids}) about pre-draft disconnect for lobby {lobby_id}.")
                    for pid in remaining_participant_ids:
                        send_message_to_client(apigw_management_client, pid, notification_payload)
            
            # Check if equilibration is enabled to determine what to preserve
            is_equilibration_enabled = lobby_item.get('equilibrationEnabled', False)
            
            # Reset lobby state to WAITING
            expression_attribute_names["#LState"] = "lobbyState"
            update_expressions.append("#LState = :waitState")
            expression_attribute_values[':waitState'] = 'WAITING'

            # Reset remaining player's ready status (the disconnected player's status is already being reset above)
            if disconnected_player_slot_prefix != "player1":
                expression_attribute_names["#P1RdyReset"] = "player1Ready"
                update_expressions.append("#P1RdyReset = :falseVal")
                # Only reset score submission if equilibration is disabled
                if not is_equilibration_enabled:
                    expression_attribute_names["#P1SubReset"] = "player1ScoreSubmitted"
                    update_expressions.append("#P1SubReset = :falseVal")
            
            if disconnected_player_slot_prefix != "player2":
                expression_attribute_names["#P2RdyReset"] = "player2Ready"
                update_expressions.append("#P2RdyReset = :falseVal")
                # Only reset score submission if equilibration is disabled
                if not is_equilibration_enabled:
                    expression_attribute_names["#P2SubReset"] = "player2ScoreSubmitted"
                    update_expressions.append("#P2SubReset = :falseVal")
            
            # Remove pre-draft ready state specific data
            remove_expressions.extend([
                "effectiveDraftOrder", "playerRoles",
                "equilibrationBansAllowed", "equilibrationBansMade", "currentEquilibrationBanner"
            ])
            # Only remove score data if equilibration is disabled - preserve for box score submission
            if not is_equilibration_enabled:
                if "player1Sequences" not in remove_expressions: remove_expressions.append("player1Sequences")
                if "player1WeightedBoxScore" not in remove_expressions: remove_expressions.append("player1WeightedBoxScore")
                if "player2Sequences" not in remove_expressions: remove_expressions.append("player2Sequences")
                if "player2WeightedBoxScore" not in remove_expressions: remove_expressions.append("player2WeightedBoxScore")

        elif current_lobby_state == 'WAITING':
            logger.info(f"{player_name_for_logging} disconnected during WAITING state in lobby {lobby_id}. Resetting remaining player's ready status.")
            last_action_message = f"{player_name_for_logging} disconnected. Remaining player's ready status reset."
            
            # Notify remaining participants about the waiting state disconnect
            if apigw_management_client:
                # Get remaining participant connection IDs
                remaining_participant_ids = []
                if host_connection_id and host_connection_id != connection_id:
                    remaining_participant_ids.append(host_connection_id)
                if p1_connection_id and p1_connection_id != connection_id:
                    remaining_participant_ids.append(p1_connection_id)
                if p2_connection_id and p2_connection_id != connection_id:
                    remaining_participant_ids.append(p2_connection_id)
                
                if remaining_participant_ids:
                    notification_payload = {
                        "type": "alert",
                        "message": f"{player_name_for_logging} has left the lobby. Ready status has been reset.",
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }
                    logger.info(f"Notifying remaining players ({remaining_participant_ids}) about waiting state disconnect for lobby {lobby_id}.")
                    for pid in remaining_participant_ids:
                        send_message_to_client(apigw_management_client, pid, notification_payload)
            
            # Check if equilibration is enabled to determine what to preserve
            is_equilibration_enabled = lobby_item.get('equilibrationEnabled', False)
            
            # Reset remaining player's ready status if they were ready
            if disconnected_player_slot_prefix != "player1":
                # Check if player1 was ready and reset if needed
                player1_ready = lobby_item.get('player1Ready', False)
                if player1_ready:
                    expression_attribute_names["#P1RdyReset"] = "player1Ready"
                    update_expressions.append("#P1RdyReset = :falseVal")
                    logger.info(f"Resetting player1Ready status due to {player_name_for_logging} disconnect.")
            
            if disconnected_player_slot_prefix != "player2":
                # Check if player2 was ready and reset if needed
                player2_ready = lobby_item.get('player2Ready', False)
                if player2_ready:
                    expression_attribute_names["#P2RdyReset"] = "player2Ready"
                    update_expressions.append("#P2RdyReset = :falseVal")
                    logger.info(f"Resetting player2Ready status due to {player_name_for_logging} disconnect.")
            
            # Only remove score data if equilibration is disabled - preserve for box score submission
            if not is_equilibration_enabled:
                # Remove any partial score submission data that might exist
                if lobby_item.get('player1Sequences') or lobby_item.get('player1WeightedBoxScore'):
                    if "player1Sequences" not in remove_expressions: remove_expressions.append("player1Sequences")
                    if "player1WeightedBoxScore" not in remove_expressions: remove_expressions.append("player1WeightedBoxScore")
                    logger.info(f"Removing player1 score data due to {player_name_for_logging} disconnect.")
                
                if lobby_item.get('player2Sequences') or lobby_item.get('player2WeightedBoxScore'):
                    if "player2Sequences" not in remove_expressions: remove_expressions.append("player2Sequences")
                    if "player2WeightedBoxScore" not in remove_expressions: remove_expressions.append("player2WeightedBoxScore")
                    logger.info(f"Removing player2 score data due to {player_name_for_logging} disconnect.")

        # Always add/update lastAction to the SET parts
        expression_attribute_names["#LAction"] = "lastAction"
        update_expressions.append("#LAction = :lastActVal") 
        expression_attribute_values[':lastActVal'] = last_action_message

        # Construct final UpdateExpression
        final_update_expr = ""
        unique_update_expressions = list(set(update_expressions)) # Deduplicate identical SET strings
        unique_remove_expressions = list(set(remove_expressions))   # Deduplicate identical REMOVE strings

        if unique_update_expressions:
            final_update_expr += "SET " + ", ".join(unique_update_expressions)
        
        if unique_remove_expressions:
            if final_update_expr: final_update_expr += " "
            final_update_expr += "REMOVE " + ", ".join(unique_remove_expressions)
        
        if final_update_expr:
            logger.info(f"DISCONNECT_HANDLER: Final Update Expression: {final_update_expr}")
            logger.info(f"DISCONNECT_HANDLER: ExpressionAttributeValues: {expression_attribute_values}")
            update_kwargs = {
                'Key': {'lobbyId': lobby_id},
                'UpdateExpression': final_update_expr,
                'ExpressionAttributeValues': expression_attribute_values
            }
            if expression_attribute_names: 
                logger.info(f"DISCONNECT_HANDLER: ExpressionAttributeNames: {expression_attribute_names}")
                update_kwargs['ExpressionAttributeNames'] = expression_attribute_names
            
            lobbies_table.update_item(**update_kwargs)
            logger.info(f"Lobby {lobby_id} updated after disconnect.")
            
            if apigw_management_client:
                 broadcast_lobby_state(lobby_id, apigw_management_client, last_action=last_action_message, exclude_connection_id=connection_id)
        else:
            logger.warning(f"DISCONNECT_HANDLER: No DDB update expression generated for disconnect in lobby {lobby_id}.")
            if apigw_management_client: # Still broadcast if no DDB update but lastAction might be relevant
                 broadcast_lobby_state(lobby_id, apigw_management_client, last_action=last_action_message, exclude_connection_id=connection_id)

    except Exception as e_main_try:
        logger.error(f"DISCONNECT_HANDLER_ERROR: Failed to process lobby updates for lobby {lobby_id} after disconnect of {connection_id}: {str(e_main_try)}", exc_info=True)
        if apigw_management_client: # Attempt to notify remaining players about the error
            broadcast_lobby_state(lobby_id, apigw_management_client, f"Error processing disconnect for {player_name_for_logging}.", exclude_connection_id=connection_id)

    return {'statusCode': 200, 'body': 'Disconnect processed.'}