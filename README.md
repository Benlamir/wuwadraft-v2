# Wuthering Waves Drafting System

A real-time drafting system for Wuthering Waves, built with AWS Lambda and WebSocket API Gateway.

## Project Structure

```
wuwadraft-v2/
├── frontend/           # Frontend code
│   ├── css/
│   ├── js/
│   └── index.html
├── backend/           # Backend Lambda functions
│   ├── connectHandler/
│   ├── disconnectHandler/
│   └── defaultHandler/
└── README.md
```

## Setup Instructions

### Frontend

1. Navigate to the `frontend` directory
2. Open `index.html` in your browser or use a local development server

### Backend

1. Navigate to the `backend` directory
2. Each Lambda function has its own directory with its dependencies
3. Follow the specific setup instructions in each handler's directory

## Technologies Used

- Frontend: HTML5, CSS3, JavaScript, Bootstrap 5
- Backend: AWS Lambda, API Gateway WebSocket
- Infrastructure: AWS SAM (Serverless Application Model)

## Development

1. Clone the repository
2. Install dependencies for each Lambda function
3. Use AWS SAM CLI for local development and deployment

## License

MIT License
