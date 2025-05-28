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
  //console.log("MH_TRACE: handleWebSocketMessage START");
  //console.log("MH_TRACE: Raw data:", jsonData);
  try {
    const message = JSON.parse(jsonData);
    //console.log("MH_TRACE: Parsed message:", message);

    switch (message.type) {
      case "lobbyCreated":
        //console.log("MessageHandler: Received lobbyCreated message:", message);
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

        // Determine the 'isHost' value
        const isJoiningClientTheHost = message.hasOwnProperty("isHost")
          ? message.isHost
          : false;

        // Set lobby info with correct host status and assigned slot
        state.setLobbyInfo(
          message.lobbyId,
          isJoiningClientTheHost,
          message.assignedSlot
        );

        let wasRedirectedToBSS = false;
        if (message.hasOwnProperty("equilibrationEnabled")) {
          state.setEquilibrationEnabledForLobby(message.equilibrationEnabled);

          // +++ ADD LOGS HERE +++
          console.log(
            `LOBBY_JOINED_BSS_CHECK: LobbyID: ${message.lobbyId}, AssignedSlot: ${message.assignedSlot}, EquilibrationEnabled from MSG: ${message.equilibrationEnabled}, PlayerScoreSubmitted from MSG: ${message.playerScoreSubmitted}`
          );
          console.log(
            `LOBBY_JOINED_BSS_CHECK: Current state.equilibrationEnabledForLobby: ${state.equilibrationEnabledForLobby}`
          );

          if (
            message.equilibrationEnabled &&
            message.assignedSlot && // Check if they were assigned a player slot (P1/P2)
            !message.playerScoreSubmitted
          ) {
            //console.log(
            //  "MH_TRACE: Equilibration ON, player new/score not submitted, redirecting to Box Score Screen."
            //);
            state.setEquilibrationEnabledForLobby(message.equilibrationEnabled);
            state.setLocalPlayerHasSubmittedScore(false);
            state.setHasPopulatedBoxScoreScreenThisTurn(false);
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
        //console.log(
        //  "MH_TRACE: Case boxScoreSubmitted - score acknowledged by server for this client."
        //);
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

        // +++ ADD THIS LOG IMMEDIATELY +++
        console.log(
          "LOBBY_STATE_UPDATE_RECEIVED: Raw message.equilibrationEnabled:",
          message.equilibrationEnabled
        );

        // Check what message.equilibrationEnabled is specifically
        const incomingEqEnabled = message.equilibrationEnabled;
        console.log(
          `MH_LSU: Incoming message.equilibrationEnabled is: ${incomingEqEnabled} (type: ${typeof incomingEqEnabled})`
        );

        // Log before setting
        console.log(
          `MH_LSU: BEFORE setEquilibrationEnabledForLobby, current state.equilibrationEnabledForLobby is: ${state.equilibrationEnabledForLobby}`
        );

        state.setEquilibrationEnabledForLobby(incomingEqEnabled || false); // Use the captured variable

        // Log after setting
        console.log(
          `MH_LSU: AFTER setEquilibrationEnabledForLobby, new state.equilibrationEnabledForLobby is: ${state.equilibrationEnabledForLobby}`
        );

        // Store the whole message as the current draft state
        state.setCurrentDraftState(message);

        // Update granular state variables from the message
        // It's important that these are set before updateDraftScreenUI is called
        state.setEquilibrationEnabledForLobby(
          message.equilibrationEnabled || false
        );
        state.setPlayer1ScoreSubmitted(message.player1ScoreSubmitted || false);
        state.setPlayer2ScoreSubmitted(message.player2ScoreSubmitted || false);
        state.setPlayer1Picks(message.player1Picks || []);
        state.setPlayer2Picks(message.player2Picks || []);
        state.setAvailableResonators(message.availableResonators || []);

        // Crucially update phase, turn, and expiry based on the message
        // These will be null if the backend sends them as such (e.g., in PRE_DRAFT_READY state)
        state.setDraftPhase(message.currentPhase || null);
        state.setDraftTurn(message.currentTurn || null);
        state.setTurnExpiry(message.turnExpiresAt || null);

        // Logic to determine if the client (player) has submitted their score for BSS
        if (state.myAssignedSlot === "P1") {
          state.setLocalPlayerHasSubmittedScore(state.player1ScoreSubmitted);
        } else if (state.myAssignedSlot === "P2") {
          state.setLocalPlayerHasSubmittedScore(state.player2ScoreSubmitted);
        } else {
          state.setLocalPlayerHasSubmittedScore(false); // Spectator or unassigned host
        }

        // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        // ++ ADD/MODIFY THIS SCREEN TRANSITION LOGIC +++++++++++++++++++++++++++++
        // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        if (message.lobbyState === "PRE_DRAFT_READY") {
          // Lobby is ready, waiting for host to click "Start Draft"
          // updateDraftScreenUI will now use the null phase/turn and PRE_DRAFT_READY state
          // to show the "Start Draft" button to host and "Waiting..." message for timer.
          console.log(
            "MH: PRE_DRAFT_READY state detected. Updating draft screen UI."
          );
          updateDraftScreenUI(message);
          showScreen("draft-screen");
        } else if (message.currentPhase) {
          // Draft is active (e.g., BAN1, PICK1, EQUILIBRATE_BANS) or DRAFT_COMPLETE
          // This will be true after the host clicks "Start Draft" and the backend sends new state,
          // OR if the client joins/reconnects to an already active/completed draft.
          console.log("MH: Active draft phase detected:", message.currentPhase);

          // Re-enable Start Draft button text/state in case it was "Starting..." and an error occurred
          // This is a safety measure; ideally, it's hidden correctly by updateDraftScreenUI.
          if (
            elements.hostStartDraftBtn &&
            elements.hostStartDraftBtn.disabled &&
            message.lobbyState !== "PRE_DRAFT_READY"
          ) {
            elements.hostStartDraftBtn.disabled = false;
            elements.hostStartDraftBtn.innerHTML =
              '<i class="bi bi-play-circle-fill"></i> Start Draft';
          }

          updateDraftScreenUI(message);
          showScreen("draft-screen");
        } else if (message.lobbyState === "WAITING") {
          // Still in the lobby waiting room (players not ready, or BSS scores pending)
          console.log(
            "MH: WAITING state detected. Updating lobby wait screen UI."
          );
          updateLobbyWaitScreenUI(message);

          const isPlayer =
            state.myAssignedSlot === "P1" || state.myAssignedSlot === "P2";

          // +++ ADD LOGS HERE +++
          console.log(
            `LOBBY_STATE_UPDATE_BSS_CHECK (WAITING state): LobbyID: ${message.lobbyId}, isPlayer: ${isPlayer}, state.equilibrationEnabledForLobby: ${state.equilibrationEnabledForLobby}, state.localPlayerHasSubmittedScore: ${state.localPlayerHasSubmittedScore}`
          );

          // Check if player needs to go to Box Score Screen
          if (
            state.equilibrationEnabledForLobby &&
            isPlayer &&
            !state.localPlayerHasSubmittedScore
          ) {
            const currentActiveScreen =
              document.querySelector(".screen.active");
            if (
              !currentActiveScreen ||
              currentActiveScreen.id !== "box-score-screen"
            ) {
              state.setHasPopulatedBoxScoreScreenThisTurn(false);
              if (elements.submitBoxScoreBtn) {
                elements.submitBoxScoreBtn.disabled = false;
                elements.submitBoxScoreBtn.innerHTML =
                  '<i class="bi bi-check-circle-fill me-2"></i>Submit Score & Proceed';
              }
              showScreen("box-score-screen");
            }
          } else {
            state.setHasPopulatedBoxScoreScreenThisTurn(false); // Reset BSS population flag if navigating away from BSS
            showScreen("lobby-wait-screen");
          }
        } else {
          // Fallback for any other unexpected lobbyState from the server
          console.warn(
            "MH_LSU_WARN: Unhandled lobbyState for screen transition in lobbyStateUpdate:",
            message.lobbyState
          );
          updateLobbyWaitScreenUI(message); // Default to lobby wait screen
          showScreen("lobby-wait-screen");
        }
        // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        // ++ END OF SCREEN TRANSITION LOGIC ++++++++++++++++++++++++++++++++++++++
        // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        break; // End of case "lobbyStateUpdate"

      // --- NEW CASE ADDED ---
      case "forceRedirect":
        //console.log("MH_TRACE: Case forceRedirect");
        //console.log("Received forceRedirect:", message);
        const redirectMessage =
          message.message ||
          "An action requires you to return to the main screen.";
        alert(redirectMessage); // Inform the user

        // Reset client state (lobby ID, role, slot, currentDraftState etc.)
        state.clearLobbyState();
        //console.log("MH_TRACE: Client state reset via clearLobbyState().");

        // Navigate back to the welcome screen
        // Ensure uiViews is imported correctly
        showScreen("welcome-screen");
        //console.log(
        //  "MH_TRACE: Navigated to welcome screen due to:",
        //  message.reason
        //); // Log reason

        // Optional: Consider closing the WebSocket connection here if desired
        // import { closeWebSocket } from './websocket.js';
        // closeWebSocket();
        break;
      // --- END NEW CASE ---

      case "error":
        //console.log("MH_TRACE: Case error");
        console.error("MessageHandler: Server error:", message.message);
        alert(`Server Error: ${message.message}`); // Show error to user
        break;

      case "echo":
        //console.log("MH_TRACE: Case echo");
        //console.log("MessageHandler: Echo:", message.received_message);
        break;

      default:
      //console.log("MH_TRACE: Case default");
      //console.log("MessageHandler: Unknown message type:", message.type);
    }
  } catch (error) {
    //console.error("MH_TRACE: ERROR in handleWebSocketMessage:", error);
    //console.error("MH_TRACE: Received data that caused error:", jsonData);
  }
  //console.log("MH_TRACE: handleWebSocketMessage END");
}
