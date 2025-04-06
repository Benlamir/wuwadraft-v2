// --- WebSocket Connection ---

// Placeholder for the WebSocket endpoint URL - we will replace this later!
const WEBSOCKET_URL =
  "wss://bs8e4l0vld.execute-api.us-east-1.amazonaws.com/dev"; // Replace with your actual API Gateway WebSocket URL

console.log("Attempting to connect WebSocket to:", WEBSOCKET_URL);

// Create WebSocket connection.
const socket = new WebSocket(WEBSOCKET_URL);

// Connection opened
socket.addEventListener("open", (event) => {
  console.log("WebSocket connection established successfully!", event);
  // You could send an initial message here if needed, e.g., register user
  // socket.send(JSON.stringify({ action: 'register', username: 'Player1' }));
});

// Listen for messages
socket.addEventListener("message", (event) => {
  console.log("Message from server: ", event.data);
  // Here we will later parse event.data (likely JSON) and update the UI
  // const message = JSON.parse(event.data);
  // handleIncomingMessage(message);
});

// Listen for errors
socket.addEventListener("error", (event) => {
  console.error("WebSocket error observed:", event);
});

// Connection closed
socket.addEventListener("close", (event) => {
  if (event.wasClean) {
    console.log(
      `WebSocket connection closed cleanly, code=${event.code} reason=${event.reason}`
    );
  } else {
    // e.g. server process killed or network down
    // event.code is usually 1006 in this case
    console.error("WebSocket connection died (event code 1006?)");
  }
  // Optionally, you might want to implement reconnection logic here
});

// --- UI Interaction (Placeholder Functions) ---
// We will add functions here later to update the HTML based on messages

// Example function to send data (we'll call this later from UI elements)
function sendMessageToServer(messageObject) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(messageObject));
    console.log("Sent message:", messageObject);
  } else {
    console.error("WebSocket is not open. ReadyState: " + socket.readyState);
  }
}

console.log("WebSocket script loaded.");
