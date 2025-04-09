// frontend/js/main.js
import {
  initializeWebSocket,
  sendMessageToServer,
  closeWebSocket,
} from "./websocket.js";
import { initializeElements, elements } from "./uiElements.js";
import {
  showScreen,
  initializePasswordToggle,
  initializeLobbyIdToggle,
  initializeCopyButton,
} from "./uiViews.js";
import * as state from "./state.js"; // Import all state functions/vars

console.log("Main script loading...");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded and parsed");

  // Initialize references to DOM elements
  initializeElements();
  // Initialize UI components/listeners that don't require WS/State
  initializePasswordToggle();
  initializeLobbyIdToggle(); // Initialize wait screen toggle listener
  initializeCopyButton();

  // Initialize WebSocket connection and message handling
  initializeWebSocket();

  // --- Attach Event Listeners that Trigger Actions ---

  // Welcome Screen Actions
  if (elements.actionCreateBtn) {
    elements.actionCreateBtn.addEventListener("click", () => {
      showScreen("create-lobby-screen");
    });
  }
  if (elements.actionJoinBtn) {
    elements.actionJoinBtn.addEventListener("click", () => {
      showScreen("join-lobby-screen");
    });
  }
  if (elements.actionRandomizeBtn) {
    elements.actionRandomizeBtn.addEventListener("click", () => {
      console.log("Randomize Pick clicked - feature not implemented yet.");
    });
  }

  // Create Lobby Screen Action
  if (elements.createStartBtn && elements.createNameInput) {
    elements.createStartBtn.addEventListener("click", () => {
      const name = elements.createNameInput.value.trim();
      if (!name) {
        alert("Please enter your name.");
        return;
      }
      state.setUserName(name); // Store user name in state module
      sendMessageToServer({ action: "createLobby", name: name });
      // UI transition will be handled by the onmessage handler now
    });
  }

  // Join Lobby Screen Action
  if (
    elements.joinStartBtn &&
    elements.joinNameInput &&
    elements.joinLobbyIdInput
  ) {
    elements.joinStartBtn.addEventListener("click", () => {
      const name = elements.joinNameInput.value.trim();
      const lobbyId = elements.joinLobbyIdInput.value.trim().toUpperCase(); // Standardize Lobby ID case maybe?
      if (!name || !lobbyId) {
        alert("Please enter both your name and the Lobby ID.");
        return;
      }
      state.setUserName(name); // Store user name in state module
      sendMessageToServer({
        action: "joinLobby",
        name: name,
        lobbyId: lobbyId,
      });
      // UI transition will be handled by the onmessage handler now
    });
  }

  // Back Buttons
  if (elements.createBackBtn) {
    elements.createBackBtn.addEventListener("click", () =>
      showScreen("welcome-screen")
    );
  }
  if (elements.joinBackBtn) {
    elements.joinBackBtn.addEventListener("click", () =>
      showScreen("welcome-screen")
    );
  }
  if (elements.lobbyBackBtn) {
    elements.lobbyBackBtn.addEventListener("click", () => {
      // TODO: Should leaving lobby send a message? Or just disconnect?
      // For now, just go back and clear state visually
      closeWebSocket(); // Close connection cleanly
      state.clearLobbyState();
      showScreen("welcome-screen");
    });
  }
  if (elements.draftBackBtn) {
    elements.draftBackBtn.addEventListener("click", () => {
      // TODO: Handle leaving draft state properly
      closeWebSocket();
      state.clearLobbyState();
      showScreen("welcome-screen");
    });
  }

  // Ready Buttons
  function handleReadyClick() {
    console.log(
      `Sending playerReady action (My Slot: ${state.myAssignedSlot})`
    );
    sendMessageToServer({ action: "playerReady" });
    // Disable button immediately after clicking? UI update will handle final state.
    if (state.myAssignedSlot === "P1" && elements.player1ReadyBtn)
      elements.player1ReadyBtn.disabled = true;
    if (state.myAssignedSlot === "P2" && elements.player2ReadyBtn)
      elements.player2ReadyBtn.disabled = true;
  }

  if (elements.player1ReadyBtn) {
    elements.player1ReadyBtn.addEventListener("click", () => {
      if (state.myAssignedSlot === "P1") {
        // Check state module
        handleReadyClick();
      }
    });
  }
  if (elements.player2ReadyBtn) {
    elements.player2ReadyBtn.addEventListener("click", () => {
      if (state.myAssignedSlot === "P2") {
        // Check state module
        handleReadyClick();
      }
    });
  }

  // --- Show Initial Screen ---
  showScreen("welcome-screen");
  console.log("Main script initialization complete.");
}); // End of DOMContentLoaded listener
