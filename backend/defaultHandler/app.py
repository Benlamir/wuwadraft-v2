# backend/defaultHandler/app.py

import json
import boto3
import logging
import os # Import os to potentially use environment variables later

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize DynamoDB client (leaving it here for future use)
dynamodb = boto3.resource('dynamodb')

def get_apigw_management_client(event):
    """Creates an API Gateway Management API client using the specific endpoint"""
    # Extract domainName and stage from the event context
    # This ensures we use the correct endpoint for this specific API deployment
    domain_name = event.get('requestContext', {}).get('domainName')
    stage = event.get('requestContext', {}).get('stage')
    if not domain_name or not stage:
        logger.error("Could not extract domainName or stage from event context")
        raise ValueError("Missing domainName or stage in event context")

    # Construct the endpoint URL required by the Management API client
    endpoint_url = f"https://{domain_name}/{stage}"
    logger.info(f"Creating ApiGatewayManagementApi client with endpoint: {endpoint_url}")
    return boto3.client('apigatewaymanagementapi', endpoint_url=endpoint_url)

def handler(event, context):
    """
    Handles messages sent to the $default route.
    Logs the message and echoes it back to the sender.
    """
    logger.info(f"Received event: {json.dumps(event, indent=2)}")

    connection_id = event.get('requestContext', {}).get('connectionId')
    message_body_str = event.get('body', '{}') # Get the raw message body string

    if not connection_id:
        logger.error("Cannot process message without connectionId")
        return {'statusCode': 400, 'body': 'Cannot process message without connectionId.'}

    logger.info(f"Received message from connectionId {connection_id}: Body = {message_body_str}")

    try:
        # Initialize the Management API client using the current request's context
        apigw_management_client = get_apigw_management_client(event)

        # Echo the received message body back to the sender
        logger.info(f"Attempting to echo message back to connectionId {connection_id}")
        apigw_management_client.post_to_connection(
            ConnectionId=connection_id,
            Data=message_body_str.encode('utf-8') # Data must be sent as bytes
        )
        logger.info(f"Successfully echoed message to {connection_id}")

    except Exception as e:
        # Log errors related to sending the message back
        logger.error(f"Failed to post message back to connectionId {connection_id}: {str(e)}")
        # Still return 200 OK to API Gateway to acknowledge original message receipt
        # unless the failure to send back is critical for your app's logic.
        return {'statusCode': 500, 'body': f'Error sending message back: {str(e)}'} # Changed to 500 as sending failed

    # Return 200 OK to API Gateway to acknowledge the client's message was received
    return {'statusCode': 200, 'body': 'Message received and echoed.'}