// frontend/js/messageHandler.js
import * as state from "./state.js";
import {
  showScreen,
  updateLobbyWaitScreenUI,
  updateDraftScreenUI,
} from "./uiViews.js";

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
        console.log("MessageHandler: Received state:", message); // Log the received state

        state.setCurrentDraftState(message); // Store the latest state object

        // Explicitly update the specific phase and turn state variables
        if (message.hasOwnProperty("currentPhase")) {
          // Check if the property exists
          state.setDraftPhase(message.currentPhase);
        } else {
          // Optional: Log a warning if phase is missing from update message
          // console.warn("MessageHandler: lobbyStateUpdate message missing currentPhase");
          // state.setDraftPhase(null); // Or set to null if missing? Decide handling.
        }
        if (message.hasOwnProperty("currentTurn")) {
          // Check if the property exists
          state.setDraftTurn(message.currentTurn);
        } else {
          // Optional: Log a warning if turn is missing from update message
          // console.warn("MessageHandler: lobbyStateUpdate message missing currentTurn");
          // state.setDraftTurn(null); // Or set to null if missing? Decide handling.
        }

        // Decide which UI to update based on the lobbyState
        if (
          message.lobbyState &&
          (message.lobbyState === "DRAFTING" ||
            message.lobbyState === "BAN_PHASE" ||
            message.lobbyState === "PICK_PHASE" ||
            message.lobbyState === "DRAFT_COMPLETE")
        ) {
          // --- Draft is Active ---
          console.log(
            "MessageHandler: State is DRAFTING/BAN/PICK, updating draft screen."
          );
          updateDraftScreenUI(message); // Pass the received message directly
          const activeScreen = document.querySelector(".screen.active");
          if (!activeScreen || activeScreen.id !== "draft-screen") {
            console.log("MessageHandler: Switching view to draft-screen.");
            showScreen("draft-screen");
          }
        } else {
          // --- Lobby is likely still in WAITING ---
          console.log(
            "MessageHandler: State is WAITING, updating wait screen."
          );
          updateLobbyWaitScreenUI(message); // Pass the received message directly
          const activeScreen = document.querySelector(".screen.active");
          if (!activeScreen || activeScreen.id !== "lobby-wait-screen") {
            console.log("MessageHandler: Switching view to lobby-wait-screen.");
            showScreen("lobby-wait-screen");
          }
        }
        break; // End of case "lobbyStateUpdate"

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
