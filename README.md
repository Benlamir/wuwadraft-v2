# 🎮 Wuthering Waves - Real-time Pick/Ban Lobby

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Welcome! This is a fan-made, **real-time** web app simulating a "Pick/Ban" phase for Wuthering Waves. It allows friends or communities to add a fun drafting layer to custom challenges. Built with Vanilla JavaScript and a serverless AWS backend using WebSockets.

> **Note:** This project was primarily developed using AI tools as an experiment by someone **new to programming and AWS**. See the [Development Process & AI Usage](#-development-process--ai-usage) section for transparency.

---

![Application Screenshot](images/lobby-screenshot.png)
*(Consider updating the screenshot)*

---

## ✨ Features

* **Real-time Lobby:** Create/Join lobbies instantly via WebSockets.
* **Live Updates:** See player joins, readiness, picks, bans, and timer changes immediately.
* **Organizer Role:** Manage the lobby (create, delete, reset, join as player).
* **Ready Check:** Simple ready-up system before starting.
* **Pick/Ban Sequence:** Follows Ban1 -> Pick1 -> Ban2 -> Pick2.
* **Hybrid Turn Timer:**
    * Backend sends turn expiry time (`turnExpiresAt`).
    * Frontend displays a countdown.
    * Frontend notifies backend on local timeout (`turnTimeout`).
* **Automatic Timeout Handling:** Backend assigns random pick/ban if a player times out.
* **Character Filtering:** Filter the grid by element.
* **Visual Cues:** Highlights active turns, shows selections, timer status.
* **Connection Keep-Alive:** Heartbeats maintain the WebSocket connection.
* **Improved Disconnect Handling:** Server instantly knows when clients leave cleanly.
* **Auto-Cleanup:** Old lobbies removed automatically via DynamoDB TTL.

---

## 🏗️ Architecture

This project uses a serverless AWS backend and a static Vanilla JS frontend.

```mermaid
graph TD
    subgraph "User's Browser"
        A[Frontend JS (script.js)]
    end

    subgraph "AWS CloudFront"
        CF[CloudFront Distribution]
    end

    subgraph "AWS S3"
        S3[S3 Bucket (Static Files)]
    end

    subgraph "AWS API Gateway"
        APIGW[WebSocket API]:::apiGWStyle
    end

    subgraph "AWS Lambda"
        L_Connect["Lambda ($connect)"]:::lambdaStyle
        L_Disconnect["Lambda ($disconnect)"]:::lambdaStyle
        L_Default["Lambda ($default/actions)"]:::lambdaStyle
        L_Ping["Lambda (ping)"]:::lambdaStyle
        L_Timeout["Lambda (turnTimeout)"]:::lambdaStyle
    end

    subgraph "AWS DynamoDB"
        DDB[DynamoDB Table (Lobby State, Connections)]:::dbStyle
    end

    subgraph "API Gateway Management"
        APIMGMT[Management API (for sending messages)]
    end

    A -- HTTPS Request --> CF;
    CF -- Fetches Files --> S3;
    S3 -- Serves Files --> CF;
    CF -- Serves Files --> A;

    A -- WebSocket (wss://) --> APIGW;
    APIGW -- Route: $connect --> L_Connect;
    APIGW -- Route: $disconnect --> L_Disconnect;
    APIGW -- Route: $default/actions --> L_Default;
    APIGW -- Route: ping --> L_Ping;
    APIGW -- Route: turnTimeout --> L_Timeout;

    L_Connect -- Read/Write --> DDB;
    L_Disconnect -- Read/Write --> DDB;
    L_Default -- Read/Write --> DDB;
    L_Timeout -- Read/Write --> DDB;

    L_Default -- Uses --> APIMGMT;
    L_Timeout -- Uses --> APIMGMT;
    APIMGMT -- Sends Message via ConnectionID --> APIGW;
    APIGW -- Pushes Message --> A;

    classDef apiGWStyle fill:#FF9900,stroke:#333,stroke-width:2px,color:#fff;
    classDef lambdaStyle fill:#AE4DFF,stroke:#333,stroke-width:2px,color:#fff;
    classDef dbStyle fill:#2777C7,stroke:#333,stroke-width:2px,color:#fff;
    classDef s3Style fill:#D84B4B,stroke:#333,stroke-width:2px,color:#fff;
    classDef cfStyle fill:#4AB0C1,stroke:#333,stroke-width:2px,color:#fff;
    classDef clientStyle fill:#60BF65,stroke:#333,stroke-width:2px,color:#000;

    class APIGW apiGWStyle;
    class L_Connect,L_Disconnect,L_Default,L_Ping,L_Timeout lambdaStyle;
    class DDB dbStyle;
    class S3 s3Style;
    class CF cfStyle;
    class A clientStyle;

```

### Backend (AWS Serverless)

* **API Gateway (WebSocket API):** Manages persistent client connections and routes messages (`$connect`, `$disconnect`, `sendMessage`, `ping`, etc.) to Lambda.
* **AWS Lambda (Python/Node.js):** Handles the core logic triggered by WebSocket events:
    * Connection management (`$connect`, `$disconnect`).
    * Processing client actions (create, join, ready, pick, ban).
    * Calculating and sending `turnExpiresAt` timestamps.
    * Handling `turnTimeout` messages from clients.
    * Broadcasting state updates back to clients via API Gateway.
    * Responding to heartbeat `ping` messages.
* **DynamoDB:** NoSQL database storing lobby state (players, picks, bans, game phase) and active connection IDs. Uses TTL for auto-cleanup.
* **S3:** Hosts static frontend files (`index.html`, `css`, `js`, images) and `resonators.json`.
* **CloudFront:** CDN for the frontend. Provides HTTPS (required for `wss://`), caching, and serves the site.
* **IAM:** Manages permissions between AWS services.

### Frontend (Vanilla JS)

* **HTML (`index.html`):** Basic page structure.
* **CSS (`styles.css`):** Styling, layout (Flexbox/Grid), dark theme.
* **JavaScript (`script.js`):**
    * Manages WebSocket connection (`new WebSocket('wss://...')`).
    * Handles UI interactions.
    * Sends/Receives JSON messages over WebSocket.
    * Updates the DOM in real-time based on server messages.
    * Displays the countdown timer based on `turnExpiresAt`.
    * Sends `turnTimeout` message if local timer expires.
    * Sends periodic `ping` messages for heartbeat.
* **Data (`resonators.json`):** Fetched on load, contains character details.

### Communication Flow (Simplified)

1.  Client connects via WebSocket (`wss://...`).
2.  Client sends actions (JSON messages like `{"action": "createLobby"}`) via WebSocket.
3.  API Gateway routes message to Lambda.
4.  Lambda processes action, updates DynamoDB.
5.  Lambda sends state updates (JSON messages, including `turnExpiresAt`) back to relevant clients via API Gateway.
6.  Client receives message, updates UI instantly.
7.  Client sends periodic `ping`; Server responds (optional `pong`).
8.  Client sends `turnTimeout` if local timer expires. Backend handles it.
9.  Server receives `$disconnect` on connection close.

---

## 🤖 Development Process & AI Usage

This project was an experiment in AI-assisted development by a non-programmer.

* **AI Tools:** Conversational AI (like Gemini) for planning & debugging; Code-focused AI (like Cursor) for implementation.
* **Process:** Defined requirements -> Prompted AI -> Evaluated architecture/code -> Identified issues -> Guided AI through iterations & debugging -> Refactored from REST/polling to WebSockets with AI guidance.
* **Goal:** Explore AI's capability to build a full-stack, real-time app for a novice.

---

## 🚀 Live Demo

Try it out here:
[**Wuthering Waves Pick/Ban Lobby**](https://YOUR_CLOUDFRONT_DOMAIN_HERE)
*(Update with your actual CloudFront domain)*

---

## 🛠️ Setup & Deployment

Deployment involves setting up AWS services manually via the console.

### Prerequisites

* AWS Account & Console Access
* Node.js or Python (for Lambda runtime)

### Backend Deployment Steps

1.  **DynamoDB:** Create table (e.g., `MyLobbyTable`, partition key `lobbyCode` (String), enable TTL on `ttl` attribute).
2.  **IAM Role (for Lambda):** Create role with permissions for:
    * DynamoDB actions (`GetItem`, `PutItem`, `UpdateItem`, `DeleteItem` on your table).
    * S3 `GetObject` (if Lambda reads `resonators.json`).
    * CloudWatch Logs (`CreateLogGroup`, `CreateLogStream`, `PutLogEvents`).
    * API Gateway Management API (`execute-api:ManageConnections` on your WebSocket API ARN).
3.  **Lambda Functions:** Create functions for WebSocket routes (`$connect`, `$disconnect`, `$default`, `sendMessage`, `ping`, `turnTimeout`). Assign the IAM role. Configure Environment Variables (see below).
4.  **API Gateway (WebSocket API):**
    * Create WebSocket API.
    * Define Route Keys matching your Lambda functions.
    * Integrate routes with corresponding Lambda functions.
    * Deploy API to a stage (e.g., `dev`). Note the `WebSocket URL` (`wss://...`) and `API endpoint` (`https://...`).
5.  **Permissions Check:** Ensure Lambda role allows `execute-api:ManageConnections`.

### Frontend Deployment (S3 & CloudFront)

1.  **S3 Bucket:** Create/use bucket, enable static website hosting.
2.  **Upload Files:** Upload `index.html`, `styles.css`, `script.js`, `resonators.json`, `images/`. Grant public read access (or use CloudFront OAI).
3.  **Update JS:** Set `websocketUrl` in `script.js` to your API Gateway WebSocket URL (`wss://...`). Re-upload.
4.  **CloudFront Distribution:**
    * Create/use distribution pointing to S3 origin.
    * Set Default Root Object: `index.html`.
    * **Configure WebSocket Caching:** Forward necessary headers (use `Managed-WebSocketOptimized` policy or configure manually: `Origin`, `Sec-WebSocket-*`).
    * Ensure HTTPS is enabled.

### Configuration

* **`script.js`:**
    * `websocketUrl`: Your API Gateway WebSocket URL (`wss://...`).
* **Lambda Environment Variables:**
    * `TABLE_NAME`: Your DynamoDB table name.
    * `WEBSOCKET_ENDPOINT`: API Gateway Management API endpoint (`https://{api-id}.execute-api.{region}.amazonaws.com/{stage}`).
    * `S3_BUCKET_NAME` / `S3_FILE_KEY`: If Lambda reads `resonators.json`.

---

## ▶️ Usage

1.  Go to the CloudFront URL.
2.  **Organizer:** Enter name -> "Create New Lobby".
3.  Share the Lobby Code.
4.  _(Optional)_ Organizer clicks "Join as Player".
5.  **Player 2:** Enter name & Lobby Code -> "Join Lobby".
6.  When both are in -> "Ready Check" phase. Click "Ready".
7.  Pick/Ban starts automatically. Follow prompts and click characters during your turn.
8.  **Controls:** Use "Reset Lobby", "Delete Lobby", or "Leave Lobby" as needed.

---

## ⚠️ Known Issues & Limitations

* **Scalability:** API Gateway WebSocket has connection limits (check AWS docs).
* **Complexity:** Managing state across Lambda functions for WebSockets can be tricky.
* **Cost:** Constant connections incur costs (API Gateway connection minutes).
* **Mobile UI:** CSS needs further refinement for small screens.
* **Timer Sync:** Minor visual timer discrepancies possible due to network latency.

---

## 🌱 Future Improvements

* Optimize backend logic.
* Improve error handling/connection recovery.
* Enhance mobile layout.
* Allow customization (timers, pick/ban counts).
* Add spectator mode.

---

## 👋 Contributing

As an AI-assisted project by a non-programmer, direct code contributions aren't the focus. However, feedback, ideas, and bug reports are highly appreciated! Please **open an issue** on GitHub.

---

## 📜 License

MIT License: [https://opensource.org/licenses/MIT](https://opensource.org/licenses/MIT)

---

## 🙏 Acknowledgements

* Wuthering Waves by Kuro Games.
* AI Tools (e.g., Gemini, Cursor AI) for development assistance.

