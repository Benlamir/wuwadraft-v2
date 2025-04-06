import json
import boto3
import os
import logging

# Set up logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize DynamoDB client (Boto3 will use the Lambda's execution role credentials)
dynamodb = boto3.resource('dynamodb')
# Use the exact table name you created in DynamoDB
TABLE_NAME = 'WuwaDraftConnections' # Make sure this matches your table name!
table = dynamodb.Table(TABLE_NAME)

def handler(event, context):
    logger.info(f"Received event: {json.dumps(event, indent=2)}")

    connection_id = event.get('requestContext', {}).get('connectionId')

    if not connection_id:
        logger.error("Failed to get connectionId from event")
        # Returning 500 tells API Gateway the connection failed
        return {'statusCode': 500, 'body': 'Failed to connect: Missing connectionId.'}

    logger.info(f"Connect event for connectionId: {connection_id}")

    try:
        logger.info(f"Attempting to save connectionId {connection_id} to table {TABLE_NAME}")
        table.put_item(
            Item={
                'connectionId': connection_id
                # You could add other attributes here later, e.g.
                # 'connectTime': datetime.utcnow().isoformat()
            }
        )
        logger.info(f"Successfully saved connectionId {connection_id}")
        # Returning 200 tells API Gateway the connection succeeded
        return {'statusCode': 200, 'body': 'Connected.'}
    except Exception as e:
        logger.error(f"Failed to save connectionId {connection_id}: {str(e)}")
        # Returning 500 tells API Gateway the connection failed
        return {'statusCode': 500, 'body': f'Failed to connect: {str(e)}'}