// frontend/js/messageHandler.js
import * as state from "./state.js";
import {
  showScreen,
  updateLobbyWaitScreenUI,
  updateDraftScreenUI,
  startOrUpdateTimerDisplay,
  stopTimerDisplay,
} from "./uiViews.js"; // Assuming uiViews exports showScreen
import { elements } from "./uiElements.js"; // Import elements object

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
              "MH_TRACE: Equilibration ON, player new/score not submitted, redirecting to Box Score Screen."
            );
            state.setEquilibrationEnabledForLobby(message.equilibrationEnabled);
            state.setLocalPlayerHasSubmittedScore(false);
            state.setHasPopulatedBoxScoreScreenThisTurn(false); // Ensure this is set to FALSE here
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

      case "boxScoreSubmitted":
        console.log(
          "MH_TRACE: Case boxScoreSubmitted - score acknowledged by server for this client."
        );
        state.setLocalPlayerHasSubmittedScore(true);
        state.setHasPopulatedBoxScoreScreenThisTurn(false); // Reset flag here
        showScreen("lobby-wait-screen");
        if (elements.submitBoxScoreBtn) {
          elements.submitBoxScoreBtn.disabled = true;
          elements.submitBoxScoreBtn.textContent = "Score Submitted";
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

        // Update draft state if present
        if (message.hasOwnProperty("player1Picks")) {
          state.setPlayer1Picks(message.player1Picks);
        }
        if (message.hasOwnProperty("player2Picks")) {
          state.setPlayer2Picks(message.player2Picks);
        }
        if (message.hasOwnProperty("availableResonators")) {
          state.setAvailableResonators(message.availableResonators);
        }

        // Update UI elements
        updateLobbyWaitScreenUI(message);

        // Handle screen transitions based on lobby state
        if (message.lobbyState === "DRAFTING") {
          console.log(
            "MessageHandler: State is DRAFTING. Updating draft screen."
          );
          // Set the current phase from the message
          if (message.hasOwnProperty("currentPhase")) {
            state.setDraftPhase(message.currentPhase);
            console.log(
              `MessageHandler: Updated currentPhase to ${message.currentPhase}`
            );
          }
          if (message.hasOwnProperty("currentTurn")) {
            state.setDraftTurn(message.currentTurn);
            console.log(
              `MessageHandler: Updated currentTurn to ${message.currentTurn}`
            );
          }
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

          if (state.equilibrationEnabledForLobby && isPlayer) {
            if (!state.localPlayerHasSubmittedScore) {
              let serverSaysThisPlayerSubmitted = false;
              if (state.myAssignedSlot === "P1")
                serverSaysThisPlayerSubmitted =
                  message.player1ScoreSubmitted === true;
              else if (state.myAssignedSlot === "P2")
                serverSaysThisPlayerSubmitted =
                  message.player2ScoreSubmitted === true;

              if (!serverSaysThisPlayerSubmitted) {
                // This player still needs to submit.
                // If they are not currently on BSS, send them there and ensure it populates.
                const currentActiveScreen =
                  document.querySelector(".screen.active");
                if (
                  !currentActiveScreen ||
                  currentActiveScreen.id !== "box-score-screen"
                ) {
                  console.log(
                    "MH_TRACE: WAITING state, player needs to be on BSS. Populating and showing."
                  );
                  state.setHasPopulatedBoxScoreScreenThisTurn(false); // Ensure this is set to FALSE
                  showScreen("box-score-screen");
                } else {
                  // Player is already on BSS, do nothing to cause re-populate from here.
                  console.log(
                    "MH_TRACE: WAITING state, player already on BSS. No repopulate."
                  );
                }
              } else {
                // Server says this player HAS submitted.
                state.setLocalPlayerHasSubmittedScore(true); // Sync local flag
                state.setHasPopulatedBoxScoreScreenThisTurn(false); // Reset for future needs
                console.log(
                  "MH_TRACE: WAITING state, server says scores submitted for this player. Showing lobby-wait-screen."
                );
                showScreen("lobby-wait-screen");
              }
            } else {
              // localPlayerHasSubmittedScore is true
              state.setHasPopulatedBoxScoreScreenThisTurn(false); // Reset for future needs
              console.log(
                "MH_TRACE: WAITING state, local state says scores submitted. Showing lobby-wait-screen."
              );
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
