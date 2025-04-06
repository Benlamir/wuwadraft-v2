# backend/disconnectHandler/app.py

import json
import boto3
import logging

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize DynamoDB client using the Lambda execution role
dynamodb = boto3.resource('dynamodb')

# --- Configuration ---
# IMPORTANT: Make sure this matches the exact name of your DynamoDB table!
TABLE_NAME = 'WuwaDraftConnections'
# -------------------

table = dynamodb.Table(TABLE_NAME)

def handler(event, context):
    """
    Handles the $disconnect event from API Gateway WebSocket.
    Removes the connectionId from the DynamoDB table.
    """
    # Log the entire incoming event (useful for debugging)
    logger.info(f"Received event: {json.dumps(event, indent=2)}")

    # Extract connectionId from the event context provided by API Gateway
    connection_id = event.get('requestContext', {}).get('connectionId')

    if not connection_id:
        # This should generally not happen for a $disconnect event, but good to check
        logger.error("Failed to get connectionId from event for $disconnect")
        # Return 500 to indicate an unexpected issue
        return {'statusCode': 500, 'body': 'Failed to disconnect: Missing connectionId.'}

    logger.info(f"Disconnect event for connectionId: {connection_id}")

    try:
        # Attempt to delete the item corresponding to the connectionId
        logger.info(f"Attempting to delete connectionId {connection_id} from table {TABLE_NAME}")
        table.delete_item(
            Key={
                'connectionId': connection_id
            }
            # You could add ConditionExpressions here if needed, e.g., to ensure the item exists
        )
        logger.info(f"Successfully deleted connectionId {connection_id}")
        # Return 200 OK. API Gateway doesn't really use the response for $disconnect,
        # but it's good practice to indicate success.
        return {'statusCode': 200, 'body': 'Disconnected and cleaned up.'}

    except Exception as e:
        # Log any error encountered during the delete operation
        logger.error(f"Failed to delete connectionId {connection_id}: {str(e)}")
        # Return 500 to indicate an internal server error during cleanup
        # API Gateway will likely ignore this for $disconnect, but it helps in monitoring.
        return {'statusCode': 500, 'body': f'Disconnect cleanup failed: {str(e)}'}