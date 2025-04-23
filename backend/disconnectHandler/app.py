# backend/disconnectHandler/app.py

import json
import boto3
import logging
import os
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Attr
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
                return str(obj)
        return json.JSONEncoder.default(self, obj)

# --- DynamoDB Setup ---
CONNECTIONS_TABLE_NAME = 'WuwaDraftConnections'
LOBBIES_TABLE_NAME = 'WuwaDraftLobbies'
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
def send_message_to_client(apigw_client, connection_id, payload):
    """Sends a JSON payload to a specific connectionId."""
    try:
        logger.info(f"Sending message to {connection_id}: {json.dumps(payload, cls=DecimalEncoder)}")
        apigw_client.post_to_connection(
            ConnectionId=connection_id,
            Data=json.dumps(payload, cls=DecimalEncoder).encode('utf-8')
        )
        logger.info(f"Message sent successfully to {connection_id}")
        return True
    except apigw_client.exceptions.GoneException:
        logger.warning(f"Client {connection_id} is gone. Cannot send message.")
    except Exception as e:
        logger.error(f"Failed to post message to connectionId {connection_id}: {str(e)}")
    return False

# --- Broadcast Lobby State Helper ---
def broadcast_lobby_state(lobby_id, apigw_client, last_action=None, exclude_connection_id=None):
    """Fetches the latest lobby state and broadcasts it to all participants."""
    try:
        logger.info(f"Broadcasting state for lobby {lobby_id}. Last Action: {last_action}. Excluding: {exclude_connection_id}")
        final_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
        final_lobby_item = final_response.get('Item')

        if not final_lobby_item:
            logger.warning(f"Cannot broadcast state for lobby {lobby_id}, item not found.")
            return False

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
        }
        if last_action:
            state_payload["lastAction"] = last_action

        payload_json = json.dumps(state_payload, cls=DecimalEncoder)
        logger.info(f"Constructed broadcast payload (JSON): {payload_json}")

        participants = [
            final_lobby_item.get('hostConnectionId'),
            final_lobby_item.get('player1ConnectionId'),
            final_lobby_item.get('player2ConnectionId')
        ]
        valid_connection_ids = [pid for pid in participants if pid]

        failed_sends = []
        success_count = 0
        for recipient_id in valid_connection_ids:
            if recipient_id == exclude_connection_id:
                continue
            if send_message_to_client(apigw_client, recipient_id, json.loads(payload_json)):
                success_count += 1
            else:
                failed_sends.append(recipient_id)

        if failed_sends:
            logger.warning(f"Failed to send state update to some connections: {failed_sends}")
        logger.info(f"Broadcast complete. Sent to {success_count} participant(s).")
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

    # --- Initialize API Gateway Client (Best Effort) ---
    apigw_management_client = None
    try:
        apigw_management_client = get_apigw_management_client()
    except ValueError as e:
        logger.error(f"Cannot initialize APIGW client for broadcast on disconnect: {e}")

    # Find which lobby the user was in
    lobby_id = None
    try:
        response = connections_table.get_item(Key={'connectionId': connection_id})
        connection_item = response.get('Item')
        if connection_item and 'currentLobbyId' in connection_item:
            lobby_id = connection_item['currentLobbyId']
            logger.info(f"Connection {connection_id} was in lobby {lobby_id}.")
        else:
            logger.info(f"Connection {connection_id} not found in connections table or not associated with a lobby.")
            return {'statusCode': 200, 'body': 'Disconnected user not in a lobby.'}
    except Exception as e:
        logger.error(f"Failed to get connection details for {connection_id}: {str(e)}")

    # Cleanup connection table regardless
    try:
        logger.info(f"Removing connection {connection_id} from connections table.")
        connections_table.delete_item(Key={'connectionId': connection_id})
    except Exception as e:
        logger.error(f"Failed to delete connection {connection_id} from table: {str(e)}")

    # If we couldn't determine the lobby, we can't update it
    if not lobby_id:
        logger.warning(f"Cannot update lobby state because lobbyId for {connection_id} could not be determined.")
        return {'statusCode': 200, 'body': 'Connection cleaned up, lobby unknown.'}

    # --- Modify Lobby State Based on Disconnect ---
    try:
        # Get current lobby state (ConsistentRead important here)
        lobby_response = lobbies_table.get_item(Key={'lobbyId': lobby_id}, ConsistentRead=True)
        lobby_item = lobby_response.get('Item')

        if not lobby_item:
            logger.warning(f"Lobby {lobby_id} referenced by connection {connection_id} not found in lobbies table.")
            return {'statusCode': 200, 'body': 'Connection cleaned up, lobby not found.'}

        current_lobby_state = lobby_item.get('lobbyState')
        host_connection_id = lobby_item.get('hostConnectionId')
        p1_connection_id = lobby_item.get('player1ConnectionId')
        p2_connection_id = lobby_item.get('player2ConnectionId')

        update_expressions = []
        remove_expressions = []
        expression_values = {}
        last_action_msg = "A player disconnected."

        # Identify who disconnected and prepare update
        disconnected_player_name = "Player"
        if connection_id == host_connection_id:
            logger.warning(f"Host ({connection_id}) disconnected from lobby {lobby_id}. Lobby state not changed by disconnect handler.")
            return {'statusCode': 200, 'body': 'Host disconnected.'}

        elif connection_id == p1_connection_id:
            disconnected_player_name = lobby_item.get('player1Name', 'Player 1')
            remove_expressions.extend(['player1ConnectionId', 'player1Name'])

        elif connection_id == p2_connection_id:
            disconnected_player_name = lobby_item.get('player2Name', 'Player 2')
            remove_expressions.extend(['player2ConnectionId', 'player2Name'])
        else:
            logger.error(f"Connection {connection_id} associated with lobby {lobby_id} but not found as P1/P2/Host during disconnect.")
            return {'statusCode': 500, 'body': 'Internal state inconsistency.'}

        # *** Logic for Draft Reset ***
        if current_lobby_state == 'DRAFTING':
            logger.info(f"{disconnected_player_name} disconnected during draft in lobby {lobby_id}. Resetting lobby.")
            last_action_msg = f"{disconnected_player_name} disconnected during the draft."
            update_expressions.extend([
                "lobbyState = :waitState",
                "player1Ready = :falseVal",
                "player2Ready = :falseVal",
                "lastAction = :lastAct"
            ])
            remove_expressions.extend([
                "currentPhase", "currentTurn", "currentStepIndex",
                "turnExpiresAt", "bans", "player1Picks",
                "player2Picks", "availableResonators"
            ])
            expression_values[':waitState'] = 'WAITING'
            expression_values[':lastAct'] = last_action_msg
            expression_values[':falseVal'] = False
        else:
            last_action_msg = f"{disconnected_player_name} disconnected."
            update_expressions.append("lastAction = :lastAct")
            expression_values[':lastAct'] = last_action_msg

        # Construct final UpdateExpression
        final_update_expr = ""
        if update_expressions:
            final_update_expr += "SET " + ", ".join(update_expressions)
        if remove_expressions:
            if final_update_expr:
                final_update_expr += " "
            final_update_expr += "REMOVE " + ", ".join(remove_expressions)

        # Execute the update
        if final_update_expr:
            logger.info(f"Updating lobby {lobby_id} due to disconnect. Update: {final_update_expr}")
            lobbies_table.update_item(
                Key={'lobbyId': lobby_id},
                UpdateExpression=final_update_expr,
                ExpressionAttributeValues=expression_values
            )
            logger.info(f"Lobby {lobby_id} updated successfully after disconnect of {connection_id}.")
        else:
            logger.warning(f"No lobby update performed for disconnect of {connection_id} in lobby {lobby_id}")

        # Broadcast the new state if possible
        if apigw_management_client:
            logger.info(f"Attempting broadcast after disconnect for lobby {lobby_id}")
            broadcast_lobby_state(lobby_id, apigw_management_client, last_action=last_action_msg, exclude_connection_id=connection_id)
        else:
            logger.warning(f"Cannot broadcast state update for lobby {lobby_id} after disconnect - APIGW client not available.")

    except Exception as e:
        logger.error(f"Failed to update lobby {lobby_id} after disconnect of {connection_id}: {str(e)}", exc_info=True)

    return {'statusCode': 200, 'body': 'Disconnect processed.'}