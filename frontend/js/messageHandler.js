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
        console.log("MessageHandler: Received lobbyCreated message:", message);
        state.setLobbyInfo(message.lobbyId, true, message.message);
        if (message.hasOwnProperty("equilibrationEnabled")) {
          state.setEquilibrationEnabledForLobby(message.equilibrationEnabled);
        }
        // Create a lobbyStateUpdate message with the host's name
        const initialLobbyState = {
          type: "lobbyStateUpdate",
          lobbyId: message.lobbyId,
          hostName: state.currentUserName,
          player1Name: null,
          player2Name: null,
          player1Ready: false,
          player2Ready: false,
          lobbyState: "WAITING",
          equilibrationEnabled: state.equilibrationEnabledForLobby,
        };
        updateLobbyWaitScreenUI(initialLobbyState);
        showScreen("lobby-wait-screen");
        break;

      case "lobbyJoined":
        console.log("MessageHandler: Received lobbyJoined message:", message);
        state.setLobbyInfo(message.lobbyId, false, message.message);
        state.setAssignedSlot(message.assignedSlot);

        let wasRedirectedToBSS = false;
        if (message.hasOwnProperty("equilibrationEnabled")) {
          state.setEquilibrationEnabledForLobby(message.equilibrationEnabled);
          if (
            message.equilibrationEnabled &&
            state.myAssignedSlot &&
            !message.playerScoreSubmitted
          ) {
            console.log(
              "MH_TRACE: Equilibration ON and scores not submitted, redirecting to Box Score Screen."
            );
            state.setLocalPlayerHasSubmittedScore(false);
            showScreen("box-score-screen");
            wasRedirectedToBSS = true;
          } else if (
            message.equilibrationEnabled &&
            message.playerScoreSubmitted
          ) {
            state.setLocalPlayerHasSubmittedScore(true);
          }
        }
        if (!wasRedirectedToBSS) {
          showScreen("lobby-wait-screen");
        }
        break;

      case "lobbyStateUpdate":
        console.log(
          "MH_DEBUG: lobbyStateUpdate received from server:",
          JSON.stringify(message)
        );
        console.log(
          "MessageHandler: Received lobbyStateUpdate message:",
          message
        );

        // Store equilibration settings
        if (message.hasOwnProperty("equilibrationEnabled")) {
          state.setEquilibrationEnabledForLobby(message.equilibrationEnabled);
        }

        // Update UI elements
        updateLobbyWaitScreenUI(message);

        // Handle screen transitions based on lobby state
        if (message.lobbyState === "DRAFTING") {
          console.log(
            "MessageHandler: State is DRAFTING. Updating draft screen."
          );
          updateDraftScreenUI(message);
          showScreen("draft-screen");
        } else if (message.lobbyState === "WAITING") {
          console.log(
            "MessageHandler: State is WAITING. Updating/showing lobby wait screen or BSS."
          );
          updateLobbyWaitScreenUI(message);

          // Check if we need to be on BSS screen
          const isPlayer =
            state.myAssignedSlot === "P1" || state.myAssignedSlot === "P2";

          if (
            state.equilibrationEnabledForLobby &&
            isPlayer &&
            !state.localPlayerHasSubmittedScore
          ) {
            const playerSpecificScoreKey =
              state.myAssignedSlot === "P1"
                ? "player1WeightedBoxScore"
                : "player2WeightedBoxScore";
            if (
              !message[playerSpecificScoreKey] ||
              message[playerSpecificScoreKey] === 0
            ) {
              console.log(
                "MH_TRACE: WAITING state, EQ ON, scores not submitted, redirecting to Box Score Screen."
              );
              showScreen("box-score-screen");
            } else {
              state.setLocalPlayerHasSubmittedScore(true);
              showScreen("lobby-wait-screen");
            }
          } else {
            showScreen("lobby-wait-screen");
          }
        }
        break;

      // --- NEW CASE ADDED ---
      case "forceRedirect":
        console.log("MH_TRACE: Case forceRedirect");
        console.log("Received forceRedirect:", message);
        const redirectMessage =
          message.message ||
          "An action requires you to return to the main screen.";
        alert(redirectMessage); // Inform the user

        // Reset client state (lobby ID, role, slot, currentDraftState etc.)
        state.clearLobbyState();
        console.log("MH_TRACE: Client state reset via clearLobbyState().");

        // Navigate back to the welcome screen
        // Ensure uiViews is imported correctly
        showScreen("welcome-screen");
        console.log(
          "MH_TRACE: Navigated to welcome screen due to:",
          message.reason
        ); // Log reason

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
