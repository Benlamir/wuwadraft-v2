// frontend/js/messageHandler.js
import * as state from "./state.js";
import {
  showScreen,
  updateLobbyWaitScreenUI,
  updateDraftScreenUI,
  startOrUpdateTimerDisplay,
  stopTimerDisplay,
} from "./uiViews.js";

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
        console.log("MH_TRACE: Case lobbyJoined");
        state.setLobbyInfo(
          message.lobbyId,
          message.isHost,
          message.assignedSlot
        ); // Use setLobbyInfo which also sets slot
        console.log(
          "MH_TRACE: After setLobbyInfo, myAssignedSlot=",
          state.myAssignedSlot
        );
        showScreen("lobby-wait-screen");
        break;

      case "lobbyStateUpdate":
        console.log("MH_TRACE: Case lobbyStateUpdate");
        // Update internal state first
        state.setCurrentDraftState(message);
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

        // --- REVISED SCREEN LOGIC ---
        // Check the currentPhase stored in our state module AFTER updating it.
        // If a phase is set (e.g., 'BAN1', 'PICK1', ..., 'DRAFT_COMPLETE'),
        // it means the draft is active or has just finished.
        if (state.currentPhase) {
          console.log(
            `MessageHandler: Phase is '${state.currentPhase}'. Updating/showing draft screen.`
          );
          updateDraftScreenUI(message); // Update the draft UI with the new data
          showScreen("draft-screen"); // Ensure the draft screen is visible
        }
        // Only show the wait screen if the phase is null (draft hasn't started)
        // AND the lobby state indicates we are waiting.
        else if (message.lobbyState === "WAITING") {
          console.log(
            "MessageHandler: State is WAITING. Updating/showing lobby wait screen."
          );
          updateLobbyWaitScreenUI(message);
          showScreen("lobby-wait-screen");
        }
        // Fallback for potentially unexpected states (e.g., if phase is null but state isn't WAITING)
        else {
          console.warn(
            "MessageHandler: Unhandled lobbyStateUpdate screen logic - Phase:",
            state.currentPhase,
            "LobbyState:",
            message.lobbyState
          );
          // Defaulting to wait screen as a safety measure, but review if this happens.
          updateLobbyWaitScreenUI(message);
          showScreen("lobby-wait-screen");
        }
        // --- END REVISED SCREEN LOGIC ---
        break;

      case "error":
        console.log("MH_TRACE: Case error");
        console.error("MessageHandler: Server error:", message.message);
        alert(`Server Error: ${message.message}`); // Show error to user
        // Decide where to navigate user on error? Back to welcome?
        // showScreen('welcome-screen');
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
