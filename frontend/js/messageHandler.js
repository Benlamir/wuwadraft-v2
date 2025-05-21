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
        //console.log("MH_TRACE: Case lobbyStateUpdate");
        //console.log(
        // "MH_DEBUG: lobbyStateUpdate received from server:",
        //  JSON.stringify(message)
        //);

        // Ensure state module is updated with the latest granular info
        state.setCurrentDraftState(message); // Store the whole message

        // Update granular state based on the message
        if (message.hasOwnProperty("currentPhase")) {
          state.setDraftPhase(message.currentPhase);
        } else {
          state.setDraftPhase(null);
        }

        if (message.hasOwnProperty("currentTurn")) {
          state.setDraftTurn(message.currentTurn);
        } else {
          state.setDraftTurn(null);
        }

        if (message.hasOwnProperty("equilibrationEnabled")) {
          state.setEquilibrationEnabledForLobby(message.equilibrationEnabled);
        }

        // Update player-specific submission status from server FIRST
        let p1SubmittedServer = message.hasOwnProperty("player1ScoreSubmitted")
          ? message.player1ScoreSubmitted === true
          : false;
        let p2SubmittedServer = message.hasOwnProperty("player2ScoreSubmitted")
          ? message.player2ScoreSubmitted === true
          : false;

        state.setPlayer1ScoreSubmitted(p1SubmittedServer);
        state.setPlayer2ScoreSubmitted(p2SubmittedServer);

        // Now, specifically update localPlayerHasSubmittedScore for THIS client based on the new state
        // This logic assumes state.myAssignedSlot is already correctly set for the current client
        //console.log(
        // `MH_LSU_DEBUG_SLOT_CHECK: MySlot is '${state.myAssignedSlot}' before setting localPlayerHasSubmittedScore.`
        //);
        if (state.myAssignedSlot === "P1") {
          state.setLocalPlayerHasSubmittedScore(state.player1ScoreSubmitted); // Use the value just set in state
          console.log(
            `MH_LSU_DEBUG: MySlot is P1. Server P1Submitted=${p1SubmittedServer}. localPlayerHasSubmittedScore=${state.localPlayerHasSubmittedScore}`
          );
        } else if (state.myAssignedSlot === "P2") {
          state.setLocalPlayerHasSubmittedScore(state.player2ScoreSubmitted); // Use the value just set in state
          //console.log(
          //  `MH_LSU_DEBUG: MySlot is P2. Server P2Submitted=${p2SubmittedServer}. localPlayerHasSubmittedScore=${state.localPlayerHasSubmittedScore}`
          //);
        } else {
          state.setLocalPlayerHasSubmittedScore(false); // Not an active player in a slot
          //console.log(
          //  "MH_LSU_DEBUG: Not P1 or P2, localPlayerHasSubmittedScore set to false."
          //);
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

        // Handle turn expiry with robust null checking and logging
        if (
          message.hasOwnProperty("turnExpiresAt") &&
          message.turnExpiresAt !== null
        ) {
          console.log(
            "MH_TIMER_RECEIVED_EXPIRY: Server sent turnExpiresAt:",
            message.turnExpiresAt,
            " (Type:",
            typeof message.turnExpiresAt,
            ")"
          );
          state.setTurnExpiry(message.turnExpiresAt); // Update state
          startOrUpdateTimerDisplay(); // Attempt to start/update visual timer
        } else {
          console.log(
            "MH_TIMER_DEBUG: turnExpiresAt is NULL or MISSING. Calling stopTimerDisplay."
          );
          state.setTurnExpiry(null); // Update state
          stopTimerDisplay(); // Stop visual timer
        }

        // Screen Logic
        if (state.currentPhase) {
          // If draft is active (BAN, PICK, EQUILIBRATE_BANS)
          //console.log(
          //  `MessageHandler: Phase from state.js is '${state.currentPhase}'. Updating/showing draft screen.`
          //);
          updateDraftScreenUI(message);
          showScreen("draft-screen");
        } else if (message.lobbyState === "WAITING") {
          //console.log("MH_LSU_WAITING: Processing WAITING state.");
          updateLobbyWaitScreenUI(message);

          const isPlayer =
            state.myAssignedSlot === "P1" || state.myAssignedSlot === "P2";

          // Now this condition uses the correctly updated state.localPlayerHasSubmittedScore
          if (
            state.equilibrationEnabledForLobby &&
            isPlayer &&
            !state.localPlayerHasSubmittedScore
          ) {
            //console.log(
            // "MH_LSU_WAITING: EQ ON, player, scores NOT submitted for this player. Redirecting to BSS."
            //);
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
            } else {
              // Already on BSS, ensure submit button enabled
              if (
                elements.submitBoxScoreBtn &&
                elements.submitBoxScoreBtn.disabled
              ) {
                elements.submitBoxScoreBtn.disabled = false;
                elements.submitBoxScoreBtn.innerHTML =
                  '<i class="bi bi-check-circle-fill me-2"></i>Submit Score & Proceed';
              }
            }
          } else {
            //console.log(
            //  "MH_LSU_WAITING: WAITING state, but NOT redirecting to BSS (EQ_Off or NotPlayer or ScoresSubmitted by this player). Showing lobby-wait-screen."
            //);
            state.setHasPopulatedBoxScoreScreenThisTurn(false);
            showScreen("lobby-wait-screen");
          }
        } else {
          console.warn(
            "MH_LSU_WARN: Unhandled lobby/draft state for screen transition."
          );
          updateLobbyWaitScreenUI(message); // Fallback to wait screen
          showScreen("lobby-wait-screen");
        }
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
