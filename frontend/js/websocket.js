// frontend/js/websocket.js
import { WEBSOCKET_URL } from "./config.js";
import { handleWebSocketMessage } from "./messageHandler.js"; // Import the handler
import { showScreen } from "./uiViews.js"; // Import for potential error navigation
import { clearLobbyState } from "./state.js"; // Import to clear state on disconnect

let socket = null;

export function initializeWebSocket() {
  if (
    socket &&
    (socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING)
  ) {
    console.log("WebSocket already connecting or open.");
    return;
  }

  console.log("WS: Attempting to connect WebSocket to:", WEBSOCKET_URL);
  socket = new WebSocket(WEBSOCKET_URL);

  socket.addEventListener("open", (event) => {
    console.log("WS: WebSocket connection established successfully!", event);
  });

  socket.addEventListener("message", (event) => {
    console.log("WS: Message from server raw:", event.data);
    handleWebSocketMessage(event.data); // Delegate processing
  });

  socket.addEventListener("error", (event) => {
    console.error("WS: WebSocket error observed:", event);
    // Optional: Show error state to user, maybe navigate home
    alert("WebSocket connection error. Please refresh.");
    // clearLobbyState(); // Clear potentially invalid state
    // showScreen('welcome-screen');
  });

  socket.addEventListener("close", (event) => {
    if (event.wasClean) {
      console.log(
        `WS: WebSocket connection closed cleanly, code=${event.code} reason=${event.reason}`
      );
    } else {
      console.error(
        `WS: WebSocket connection died (event code ${event.code}?)`
      );
    }
    alert("WebSocket connection closed. You may need to rejoin.");
    clearLobbyState(); // Clear lobby state on disconnect
    showScreen("welcome-screen"); // Navigate back to welcome on disconnect
    socket = null; // Clear socket variable
    // Optional: Implement reconnection logic here? For now, just go home.
  });
}

export function sendMessageToServer(messageObject) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    const messageString = JSON.stringify(messageObject);
    socket.send(messageString);
    console.log("WS: Sent message:", messageObject);
  } else {
    console.error("WS: WebSocket is not open. ReadyState:", socket?.readyState);
    alert("Cannot send message: Not connected to server.");
  }
}

// Optional: Function to explicitly close the socket if needed
export function closeWebSocket() {
  if (socket && socket.readyState === WebSocket.OPEN) {
    console.log("WS: Closing WebSocket connection.");
    socket.close(1000, "User initiated disconnect"); // Send code 1000
  }
  socket = null;
}
