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
import * as uiViews from "./uiViews.js"; // Or specific functions like applyCharacterFilter if using named exports

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
      console.log("Lobby Back Button (Player Leave - Wait Screen) clicked.");
      if (state.currentLobbyId) {
        sendMessageToServer({
          action: "leaveLobby",
          lobbyId: state.currentLobbyId,
        });
      } else {
        console.warn("Cannot leave lobby, currentLobbyId is null.");
      }
      // Action: Navigate self back, clear state, close WS
      closeWebSocket(); // Close connection cleanly
      state.clearLobbyState();
      showScreen("welcome-screen");
    });
  } else {
    console.warn("Lobby Back Button not found during listener setup.");
  }

  // ----- NEW: Leave Draft Listener -----
  const draftLeaveButton = document.querySelector(
    "#draft-player-controls #draft-back-btn"
  );

  if (draftLeaveButton) {
    draftLeaveButton.addEventListener("click", () => {
      console.log("[main.js] Player Leave Draft button clicked.");

      // Verify user is a player (not host) and has a valid lobby ID
      if (!state.isCurrentUserHost && state.currentLobbyId) {
        // Add confirmation dialog
        if (confirm("Are you sure you want to leave this draft?")) {
          console.log(
            "[main.js] Conditions met (Player, has Lobby ID). Sending leaveLobby and cleaning up locally."
          );

          // Step 1: Send WebSocket message to the backend
          sendMessageToServer({
            action: "leaveLobby",
            lobbyId: state.currentLobbyId,
          });

          // Only clear draft-related state, keep connection alive
          state.clearDraftState();
          uiViews.showScreen("welcome-screen"); // Navigate the UI back to the welcome screen
        }
      } else {
        // This case should ideally not happen if the button is correctly hidden for the host,
        // but it's good defensive programming.
        console.warn(
          `[main.js] Leave Draft button action stopped. Conditions not met: isHost=${state.isCurrentUserHost}, lobbyId=${state.currentLobbyId}`
        );
      }
    });
    console.log(
      "[main.js] Event listener attached to player's Leave Draft button."
    );
  } else {
    console.error(
      "[main.js] ERROR: Could not find the player's Leave Draft button (#draft-player-controls #draft-back-btn) to attach listener."
    );
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

  // --- Attach Event Listeners for Filter Controls ---
  const filterControls = document.querySelectorAll(
    "#draft-filter-controls .filter-btn, #draft-filter-controls .element-filter-icon"
  );
  if (filterControls.length > 0) {
    filterControls.forEach((control) => {
      control.addEventListener("click", (event) => {
        const filterElement = event.currentTarget.dataset.element; // 'All', 'Aero', 'Electro', etc.
        if (filterElement) {
          console.log(`UI: Filter clicked - ${filterElement}`);
          try {
            // Call the function from uiViews to handle filtering
            if (typeof uiViews.applyCharacterFilter === "function") {
              uiViews.applyCharacterFilter(filterElement);
            } else {
              console.error(
                "applyCharacterFilter function not found in uiViews"
              );
            }

            // Update active class on buttons/icons for visual feedback
            filterControls.forEach((btn) => {
              // Check if it's the button or the image icon for class handling
              if (
                btn.classList.contains("filter-btn") ||
                btn.tagName === "IMG"
              ) {
                btn.classList.remove("active");
              }
            });
            // Add active class to the specific clicked element
            event.currentTarget.classList.add("active");
          } catch (e) {
            console.error("Error applying filter:", e);
          }
        } else {
          console.warn(
            "Clicked filter control missing data-element attribute."
          );
        }
      });
    });
    console.log("UI: Filter control listeners attached.");

    // Ensure 'All' filter is active by default visually if needed
    const allButton = document.querySelector(
      '#draft-filter-controls .filter-btn[data-element="All"]'
    );
    if (allButton) {
      allButton.classList.add("active"); // Set 'All' as active initially
    }
  } else {
    console.warn("UI: Could not find filter controls to attach listeners.");
  }
  // --- End of Filter Control Listeners ---

  // --- NEW: Host Control Event Listeners (Wait Screen) ---
  if (elements.hostDeleteLobbyBtn) {
    elements.hostDeleteLobbyBtn.addEventListener("click", () => {
      console.log("Host: Delete Lobby button clicked.");
      if (state.isCurrentUserHost && state.currentLobbyId) {
        if (
          confirm(
            "Are you sure you want to delete this lobby? This cannot be undone."
          )
        ) {
          sendMessageToServer({
            action: "deleteLobby",
            lobbyId: state.currentLobbyId,
          });
          // Don't navigate immediately, wait for confirmation or handle disconnect
        }
      } else {
        console.warn(
          "Delete button clicked but user is not host or lobbyId is missing."
        );
      }
    });
  } else {
    console.warn("Host Delete Lobby Button not found during listener setup.");
  }

  if (elements.hostJoinSlotBtn) {
    elements.hostJoinSlotBtn.addEventListener("click", () => {
      console.log("Host: Join as Player button clicked.");
      if (state.isCurrentUserHost && state.currentLobbyId) {
        sendMessageToServer({
          action: "hostJoinSlot",
          lobbyId: state.currentLobbyId,
        });
      } else {
        console.warn(
          "Join slot button clicked but user is not host or lobbyId is missing."
        );
      }
    });
  } else {
    console.warn("Host Join Slot Button not found during listener setup.");
  }

  if (elements.hostKickP1Btn) {
    elements.hostKickP1Btn.addEventListener("click", () => {
      console.log("Host: Kick P1 button clicked.");
      if (state.isCurrentUserHost && state.currentLobbyId) {
        if (
          confirm(
            `Are you sure you want to kick Player 1 (${
              state.currentDraftState?.player1Name || "Unknown"
            })?`
          )
        ) {
          sendMessageToServer({
            action: "kickPlayer",
            lobbyId: state.currentLobbyId,
            playerSlot: "P1", // Specify which player to kick
          });
        }
      } else {
        console.warn(
          "Kick P1 button clicked but user is not host or lobbyId is missing."
        );
      }
    });
  } else {
    console.warn("Host Kick P1 Button not found during listener setup.");
  }

  if (elements.hostKickP2Btn) {
    elements.hostKickP2Btn.addEventListener("click", () => {
      console.log("Host: Kick P2 button clicked.");
      if (state.isCurrentUserHost && state.currentLobbyId) {
        if (
          confirm(
            `Are you sure you want to kick Player 2 (${
              state.currentDraftState?.player2Name || "Unknown"
            })?`
          )
        ) {
          sendMessageToServer({
            action: "kickPlayer",
            lobbyId: state.currentLobbyId,
            playerSlot: "P2", // Specify which player to kick
          });
        }
      } else {
        console.warn(
          "Kick P2 button clicked but user is not host or lobbyId is missing."
        );
      }
    });
  } else {
    console.warn("Host Kick P2 Button not found during listener setup.");
  }

  // NEW: Host Leave Slot Button Listener
  if (elements.hostLeaveSlotBtn) {
    elements.hostLeaveSlotBtn.addEventListener("click", () => {
      console.log("Host: Leave Player Slot button clicked.");
      // Verify user is host and currently in a slot
      if (
        state.isCurrentUserHost &&
        (state.myAssignedSlot === "P1" || state.myAssignedSlot === "P2") &&
        state.currentLobbyId
      ) {
        sendMessageToServer({
          action: "hostLeaveSlot",
          lobbyId: state.currentLobbyId,
        });
        // UI update will be handled by the lobbyStateUpdate message received back
      } else {
        console.warn(
          "Leave slot button clicked, but conditions not met (not host, not in slot, or no lobbyId)."
        );
      }
    });
  } else {
    console.warn("Host Leave Slot Button not found during listener setup.");
  }
  // --- END HOST CONTROL LISTENERS ---

  // --- Show Initial Screen ---
  showScreen("welcome-screen");
  console.log("Main script initialization complete.");

  // Add event listeners for draft screen
  elements.draftBackBtn.addEventListener("click", () => {
    if (state.isHost) {
      // Host can delete lobby when leaving
      if (confirm("Are you sure you want to delete this lobby?")) {
        sendMessageToServer({
          action: "deleteLobby",
          lobbyId: state.currentLobbyId,
        });
        state.clearLobbyState();
        showScreen("welcome-screen");
      }
    } else {
      // Regular players just leave
      sendMessageToServer({
        action: "leaveLobby",
        lobbyId: state.currentLobbyId,
      });
      state.clearLobbyState();
      showScreen("welcome-screen");
    }
  });

  // Add event listener for host delete draft lobby button
  elements.hostDeleteDraftLobbyBtn.addEventListener("click", () => {
    if (confirm("Are you sure you want to delete this lobby?")) {
      sendMessageToServer({
        action: "deleteLobby",
        lobbyId: state.currentLobbyId,
      });
      state.clearLobbyState();
      showScreen("welcome-screen");
    }
  });

  // Add event listener for host reset draft button
  if (elements.hostResetDraftBtn) {
    elements.hostResetDraftBtn.addEventListener("click", () => {
      console.log("Host: Reset Draft button clicked.");
      if (state.isCurrentUserHost && state.currentLobbyId) {
        if (
          confirm(
            "Are you sure you want to reset the draft? This will cancel the current picks/bans and return everyone to the lobby waiting screen."
          )
        ) {
          sendMessageToServer({
            action: "resetDraft",
            lobbyId: state.currentLobbyId,
          });
        }
      } else {
        console.warn(
          "Reset Draft button clicked but user is not host or lobbyId is missing."
        );
      }
    });
  } else {
    console.warn("Host Reset Draft Button not found during listener setup.");
  }
}); // End of DOMContentLoaded listener
