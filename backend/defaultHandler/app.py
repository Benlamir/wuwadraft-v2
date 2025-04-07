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
             # --- TODO: Implement joinLobby logic here ---
            logger.warning(f"'joinLobby' action received but not implemented yet.")
            send_message_to_client(apigw_management_client, connection_id, {
                "type": "info",
                "message": "Join lobby functionality coming soon!"
            })
            return {'statusCode': 200, 'body': 'Join lobby not implemented.'}

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