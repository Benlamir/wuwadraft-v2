// frontend/js/messageHandler.js
import * as state from "./state.js";
import { showScreen, updateLobbyWaitScreenUI } from "./uiViews.js";

export function handleWebSocketMessage(jsonData) {
  console.log("MessageHandler: Received data:", jsonData);
  try {
    const message = JSON.parse(jsonData);
    console.log("MessageHandler: Parsed message:", message);

    switch (message.type) {
      case "lobbyCreated":
        console.log("MessageHandler: Processing lobbyCreated");
        state.setLobbyInfo(message.lobbyId, message.isHost);
        // Need username from create action, maybe store globally in main.js first?
        // state.setUserName(???)
        updateLobbyWaitScreenUI({
          // Provide initial state for UI update
          lobbyId: message.lobbyId,
          hostName: state.currentUserName, // Use name stored when user clicked Create
          player1Name: null,
          player2Name: null,
          lobbyState: "WAITING",
          player1Ready: false,
          player2Ready: false,
        });
        showScreen("lobby-wait-screen");
        break;

      case "lobbyJoined":
        console.log("MessageHandler: Processing lobbyJoined");
        state.setLobbyInfo(message.lobbyId, message.isHost);
        state.setAssignedSlot(message.assignedSlot);
        // Username was set when user clicked Join in main.js
        // We need the full state to display correctly, wait for lobbyStateUpdate
        // updateLobbyWaitScreenUI(... need full state ...); // Or just show basic joined message?
        showScreen("lobby-wait-screen"); // Navigate first
        // Expecting a lobbyStateUpdate immediately after this to populate fully
        break;

      case "lobbyStateUpdate":
        console.log("MessageHandler: Processing lobbyStateUpdate");
        // Assuming message contains the full state needed by updateLobbyWaitScreenUI
        updateLobbyWaitScreenUI(message);

        // Check if draft started AFTER updating UI
        if (
          message.lobbyState &&
          (message.lobbyState.startsWith("DRAFTING") ||
            message.lobbyState.startsWith("BAN_PHASE"))
        ) {
          console.log(
            "MessageHandler: Draft starting! Transitioning screen..."
          );
          showScreen("draft-screen");
        }
        break;

      case "error":
        console.error("MessageHandler: Server error:", message.message);
        alert(`Server Error: ${message.message}`); // Show error to user
        // Decide where to navigate user on error? Back to welcome?
        // showScreen('welcome-screen');
        break;

      case "echo":
        console.log("MessageHandler: Echo:", message.received_message);
        break;

      default:
        console.log("MessageHandler: Unknown message type:", message.type);
    }
  } catch (error) {
    console.error(
      "MessageHandler: Error parsing message JSON or processing message:",
      error
    );
    console.error("Received data that caused error:", jsonData);
  }
}
