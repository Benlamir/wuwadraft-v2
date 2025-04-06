import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['CONNECTIONS_TABLE'])
apigw = boto3.client('apigatewaymanagementapi', 
    endpoint_url=f"https://{event['requestContext']['domainName']}/{event['requestContext']['stage']}")

def lambda_handler(event, context):
    connection_id = event['requestContext']['connectionId']
    body = json.loads(event['body'])
    
    # Process the message
    # TODO: Add your message processing logic here
    
    # Broadcast the message to all connected clients
    response = table.scan()
    for item in response['Items']:
        try:
            apigw.post_to_connection(
                ConnectionId=item['connectionId'],
                Data=json.dumps(body)
            )
        except:
            # If sending fails, remove the connection
            table.delete_item(Key={'connectionId': item['connectionId']})
    
    return {
        'statusCode': 200,
        'body': json.dumps('Message processed successfully!')
    } 