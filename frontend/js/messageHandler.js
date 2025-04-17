// frontend/js/messageHandler.js
import * as state from "./state.js";
import {
  showScreen,
  updateLobbyWaitScreenUI,
  updateDraftScreenUI,
  startOrUpdateTimerDisplay,
  stopTimerDisplay,
} from "./uiViews.js"; // Assuming uiViews exports showScreen

export function handleWebSocketMessage(jsonData) {
  console.log("MH_TRACE: handleWebSocketMessage START");
  console.log("MH_TRACE: Raw data:", jsonData);
  try {
    const message = JSON.parse(jsonData);
    console.log("MH_TRACE: Parsed message:", message);

    switch (message.type) {
      case "lobbyCreated":
        console.log("MH_TRACE: Case lobbyCreated");
        state.setLobbyInfo(message.lobbyId, message.isHost);
        // Assuming currentUserName is set correctly elsewhere before this is called
        updateLobbyWaitScreenUI({
          lobbyId: message.lobbyId,
          hostName: state.currentUserName,
          player1Name: null,
          player2Name: null,
          lobbyState: "WAITING",
          player1Ready: false,
          player2Ready: false,
        });
        showScreen("lobby-wait-screen");
        break;

      case "lobbyJoined":
        console.log("MH_TRACE: Case lobbyJoined");
        state.setLobbyInfo(
          message.lobbyId,
          message.isHost,
          message.assignedSlot
        );
        console.log(
          "MH_TRACE: After setLobbyInfo, myAssignedSlot=",
          state.myAssignedSlot
        );
        // We need the initial lobby state here to populate the UI correctly
        // This should ideally come with the lobbyJoined confirmation or via a separate lobbyStateUpdate
        // For now, showing the screen, but UI might be empty until first state update
        showScreen("lobby-wait-screen");
        break;

      case "lobbyStateUpdate":
        console.log("MH_TRACE: Case lobbyStateUpdate");
        // Update internal state first
        state.setCurrentDraftState(message); // Store the whole state
        if (message.hasOwnProperty("currentPhase")) {
          state.setDraftPhase(message.currentPhase);
        }
        if (message.hasOwnProperty("currentTurn")) {
          state.setDraftTurn(message.currentTurn);
        }
        // Timer Handling
        if (message.hasOwnProperty("turnExpiresAt")) {
          console.log(
            `MessageHandler DEBUG: Found turnExpiresAt: ${message.turnExpiresAt}`
          );
          state.setTurnExpiry(message.turnExpiresAt);
          startOrUpdateTimerDisplay(); // Start/update timer based on new expiry
        } else {
          console.log(
            "MessageHandler DEBUG: No turnExpiresAt found in update."
          );
          state.setTurnExpiry(null);
          stopTimerDisplay(); // Stop timer if no expiry provided
        }

        // Screen Logic based on updated state
        if (state.currentPhase) { // Draft is active or complete
          console.log(
            `MessageHandler: Phase is '${state.currentPhase}'. Updating/showing draft screen.`
          );
          updateDraftScreenUI(message);
          showScreen("draft-screen");
        } else if (message.lobbyState === "WAITING") { // Waiting for players/ready
          console.log(
            "MessageHandler: State is WAITING. Updating/showing lobby wait screen."
          );
          updateLobbyWaitScreenUI(message);
          showScreen("lobby-wait-screen");
        } else { // Fallback
          console.warn(
            "MessageHandler: Unhandled lobbyStateUpdate screen logic - Phase:",
            state.currentPhase,
            "LobbyState:",
            message.lobbyState
          );
          updateLobbyWaitScreenUI(message);
          showScreen("lobby-wait-screen");
        }
        break;

      // --- NEW CASE ADDED ---
      case 'forceRedirect':
        console.log("MH_TRACE: Case forceRedirect");
        console.log("Received forceRedirect:", message);
        const redirectMessage = message.message || "An action requires you to return to the main screen.";
        alert(redirectMessage); // Inform the user

        // Reset client state (lobby ID, role, slot, currentDraftState etc.)
        // Ensure state.resetClientState() exists in state.js and clears relevant variables
        if (typeof state.resetClientState === 'function') {
            state.resetClientState();
            console.log("MH_TRACE: Client state reset via resetClientState().");
        } else {
             // Fallback if resetClientState doesn't exist (implement it in state.js!)
            console.warn("MH_TRACE: state.resetClientState function not found! Attempting manual reset.");
            state.setLobbyInfo(null, false, null); // Clears lobbyId, isHost, assignedSlot
            state.setCurrentDraftState(null); // Clears draft state
            state.setDraftPhase(null); // Clears phase
            state.setDraftTurn(null); // Clears turn
            state.setTurnExpiry(null); // Clears timer expiry
            // Add any other state variables that need clearing
        }

        // Navigate back to the welcome screen
        // Ensure uiViews is imported correctly
        showScreen('welcome-screen');
        console.log("MH_TRACE: Navigated to welcome screen due to:", message.reason); // Log reason

        // Optional: Consider closing the WebSocket connection here if desired
        // import { closeWebSocket } from './websocket.js';
        // closeWebSocket();
        break;
      // --- END NEW CASE ---

      case "error":
        console.log("MH_TRACE: Case error");
        console.error("MessageHandler: Server error:", message.message);
        alert(`Server Error: ${message.message}`); // Show error to user
        break;

      case "echo":
        console.log("MH_TRACE: Case echo");
        console.log("MessageHandler: Echo:", message.received_message);
        break;

      default:
        console.log("MH_TRACE: Case default");
        console.log("MessageHandler: Unknown message type:", message.type);
    }
  } catch (error) {
    console.error("MH_TRACE: ERROR in handleWebSocketMessage:", error);
    console.error("MH_TRACE: Received data that caused error:", jsonData);
  }
  console.log("MH_TRACE: handleWebSocketMessage END");
}
