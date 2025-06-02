import json
import boto3
import os
import logging
import time  # Import time
from datetime import datetime, timedelta, timezone  # Import datetime utilities

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize DynamoDB client (Boto3 will use the Lambda's execution role credentials)
dynamodb = boto3.resource('dynamodb')
# Use the exact table name you created in DynamoDB
TABLE_NAME = os.environ.get('CONNECTIONS_TABLE_NAME', 'WuwaDraftConnections')
table = dynamodb.Table(TABLE_NAME)

def handler(event, context):
    logger.info(f"Received event: {json.dumps(event, indent=2)}")

    connection_id = event.get('requestContext', {}).get('connectionId')

    if not connection_id:
        logger.error("Failed to get connectionId from event")
        # Returning 500 tells API Gateway the connection failed
        return {'statusCode': 500, 'body': 'Failed to connect: Missing connectionId.'}

    logger.info(f"Connect event for connectionId: {connection_id}")

    # Connection TTL configuration (5 hours)
    CONNECTION_TTL_HOURS = 5

    try:
        logger.info(f"Attempting to save connectionId {connection_id} to table {TABLE_NAME}")
        
        # Calculate TTL for connection expiration (5 hours from connection)
        expiry_time = datetime.now(timezone.utc) + timedelta(hours=CONNECTION_TTL_HOURS)
        ttl_timestamp = int(expiry_time.timestamp())  # Convert to Unix epoch seconds
        logger.info(f"Connection {connection_id} will expire at {expiry_time.isoformat()} (TTL: {ttl_timestamp})")
        
        table.put_item(
            Item={
                'connectionId': connection_id,
                'ttl': ttl_timestamp,  # Add TTL attribute for automatic DynamoDB expiration
                'connectTime': datetime.now(timezone.utc).isoformat()  # Optional: track connect time
            }
        )
        logger.info(f"Successfully saved connectionId {connection_id} with TTL")
        # Returning 200 tells API Gateway the connection succeeded
        return {'statusCode': 200, 'body': 'Connected.'}
    except Exception as e:
        logger.error(f"Failed to save connectionId {connection_id}: {str(e)}")
        # Returning 500 tells API Gateway the connection failed
        return {'statusCode': 500, 'body': f'Failed to connect: {str(e)}'}