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
import { LOCAL_STORAGE_SEQUENCES_KEY } from "./config.js";
import { initializeResonatorData } from "./resonatorData.js";

console.log("Main script loading...");

document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOM fully loaded and parsed");

  await initializeResonatorData();

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

  // Helper function to reset the Start Lobby button state
  function resetStartLobbyButton() {
    if (elements.createStartBtn && elements.createStartBtn.disabled) {
      elements.createStartBtn.disabled = false;
      elements.createStartBtn.innerHTML = "Start Lobby";
    }
  }

  // Create Lobby Screen Action
  if (
    elements.createStartBtn &&
    elements.createNameInput &&
    elements.enableEquilibrationToggle
  ) {
    elements.createStartBtn.addEventListener("click", () => {
      const name = elements.createNameInput.value.trim();
      const enableEquilibration = elements.enableEquilibrationToggle.checked;

      if (!name) {
        alert("Please enter your name.");
        return;
      }

      // Show loading indicator immediately
      const originalText = elements.createStartBtn.innerHTML;
      elements.createStartBtn.disabled = true;
      elements.createStartBtn.innerHTML =
        '<i class="bi bi-hourglass-split"></i> Creating Lobby...';

      state.setUserName(name); // Store user name in state module

      console.log("Frontend: Attempting to create lobby with settings:", {
        action: "createLobby",
        name: name,
        enableEquilibration: enableEquilibration,
      });

      sendMessageToServer({
        action: "createLobby",
        name: name,
        enableEquilibration: enableEquilibration,
      });

      // Reset button state after a timeout in case something goes wrong
      setTimeout(() => {
        if (elements.createStartBtn.disabled) {
          elements.createStartBtn.disabled = false;
          elements.createStartBtn.innerHTML = originalText;
        }
      }, 10000); // 10 second timeout

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
        // Add confirmation dialog
        if (confirm("Are you sure you want to leave this lobby?")) {
          sendMessageToServer({
            action: "leaveLobby",
            lobbyId: state.currentLobbyId,
          });
          // Only clear draft state and keep connection alive
          state.clearLobbyState();
          resetStartLobbyButton(); // Reset the Start Lobby button
          showScreen("welcome-screen");
        }
      } else {
        console.warn("Cannot leave lobby, currentLobbyId is null.");
        resetStartLobbyButton(); // Reset the Start Lobby button
        showScreen("welcome-screen");
      }
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

  } else {
    console.error(
      "[main.js] ERROR: Could not find the player's Leave Draft button (#draft-player-controls #draft-back-btn) to attach listener."
    );
  }

  // Ready Buttons
  function handleReadyClick() {
    sendMessageToServer({ action: "playerReady" });

    // Temporarily disable button to prevent multiple clicks until server responds
    if (state.myAssignedSlot === "P1" && elements.player1ReadyBtn) {
      elements.player1ReadyBtn.disabled = true;
    }
    if (state.myAssignedSlot === "P2" && elements.player2ReadyBtn) {
      elements.player2ReadyBtn.disabled = true;
    }
  }

  if (elements.player1ReadyBtn) {
    elements.player1ReadyBtn.addEventListener("click", (event) => {
      if (state.myAssignedSlot === "P1") {
        handleReadyClick();
      }
    });
  }

  if (elements.player2ReadyBtn) {
    elements.player2ReadyBtn.addEventListener("click", () => {
      if (state.myAssignedSlot === "P2") {
        handleReadyClick();
      }
    });
  }

  // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // ++ ADD THIS EVENT LISTENER FOR THE "START DRAFT" BUTTON ++++++++++++++++
  // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  if (elements.hostStartDraftBtn) {
    elements.hostStartDraftBtn.addEventListener("click", () => {
      // Check if the current user is the host and if there's a current lobby ID
      if (state.isCurrentUserHost && state.currentLobbyId) {
        console.log("Host: Start Draft button clicked.");
        sendMessageToServer({
          action: "hostStartsDraft",
          lobbyId: state.currentLobbyId,
        });

        // Provide immediate feedback by disabling the button
        // and changing its text. This will be updated by a lobbyStateUpdate
        // when the draft actually starts or if there's an error.
        elements.hostStartDraftBtn.disabled = true;
        elements.hostStartDraftBtn.innerHTML =
          '<i class="bi bi-hourglass-split"></i> Starting Draft...';
      } else {
        console.warn(
          "Start Draft button clicked, but user is not host or no lobbyId found.",
          "isHost:",
          state.isCurrentUserHost,
          "lobbyId:",
          state.currentLobbyId
        );
      }
    });

  } else {
    console.warn(
      "Host Start Draft Button (elements.hostStartDraftBtn) not found during listener setup."
    );
  }
  // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
  // ++ END OF "START DRAFT" BUTTON EVENT LISTENER ++++++++++++++++++++++++++
  // ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

  // --- Box Score Submit Button ---
  if (elements.submitBoxScoreBtn) {
    elements.submitBoxScoreBtn.addEventListener("click", () => {
      const sequences = {};
      const selects =
        elements.limitedResonatorsList.querySelectorAll(".sequence-select");
      selects.forEach((select) => {
        const resonatorName = select.dataset.resonatorName;
        const sequenceValue = parseInt(select.value, 10);
        // Save S0-S6. "Not Owned" (-1) could also be saved if desired.
        // Current logic in your main.js only saves if >= 0. Let's keep that for now.
        if (sequenceValue >= 0 && sequenceValue <= 6) {
          sequences[resonatorName] = sequenceValue;
        }
        // If you want to save "Not Owned" explicitly:
        // else if (sequenceValue === -1) {
        //   sequences[resonatorName] = -1;
        // }
      });
      const totalScore = parseInt(elements.totalBoxScoreDisplay.textContent);

      // ---- SAVE TO LOCALSTORAGE ----
      try {
        localStorage.setItem(
          LOCAL_STORAGE_SEQUENCES_KEY,
          JSON.stringify(sequences)
        );
        console.log(
          "MAIN_JS: Sequences saved to localStorage:",
          JSON.stringify(sequences)
        );
      } catch (e) {
        console.warn("MAIN_JS: Could not save sequences to localStorage.", e);
      }
      // -----------------------------

      sendMessageToServer({
        action: "submitBoxScore",
        lobbyId: state.currentLobbyId,
        sequences: sequences,
        totalScore: totalScore,
      });

      if (elements.submitBoxScoreBtn) {
        elements.submitBoxScoreBtn.disabled = true;
        elements.submitBoxScoreBtn.innerHTML =
          '<i class="bi bi-hourglass-split me-2"></i>Submitting...';
      }
    });
  }

  // --- Attach Event Listeners for Filter Controls ---
  // Select all filter controls: buttons with data-element, images with data-element, AND images with data-rarity
  const filterControls = document.querySelectorAll(
    '#draft-filter-controls .filter-btn[data-element="All"], #draft-filter-controls .element-filter-icon[data-element], #draft-filter-controls .rarity-filter-img[data-rarity]'
  );

  const allButton = document.getElementById("filter-all-btn");
  const elementFilterIcons = document.querySelectorAll(
    "#draft-filter-controls .element-filter-icon[data-element]"
  );
  const rarityFilterImgs = document.querySelectorAll(
    "#draft-filter-controls .rarity-filter-img[data-rarity]"
  );

  if (filterControls.length > 0) {
    filterControls.forEach((control) => {
      control.addEventListener("click", (event) => {
        const clickedControl = event.currentTarget;
        const newElementFilter = clickedControl.dataset.element;
        const newRarityFilter = clickedControl.dataset.rarity;

        let needsRender = false;

        if (newElementFilter === "All") {
          // Clicked "All" button - This logic should remain largely the same
          if (
            state.activeElementFilter !== "All" ||
            state.activeRarityFilter !== null
          ) {
            state.setActiveElementFilter("All");
            state.setActiveRarityFilter(null);
            needsRender = true;
          }
          allButton.classList.add("active");
          elementFilterIcons.forEach((icon) => icon.classList.remove("active"));
          rarityFilterImgs.forEach((img) => img.classList.remove("active"));
        } else if (newElementFilter) {
          // Clicked an Element icon (Aero, Electro, etc.)
          if (state.activeElementFilter === newElementFilter) {
            // Clicked the currently active element filter - deactivate it
            state.setActiveElementFilter("All");
            clickedControl.classList.remove("active");
            // If no rarity filter is active, "All" button becomes active
            if (state.activeRarityFilter === null) {
              allButton.classList.add("active");
            }
            needsRender = true;
          } else {
            // Clicked a new or different element filter - activate it
            state.setActiveElementFilter(newElementFilter);
            allButton.classList.remove("active");
            elementFilterIcons.forEach((icon) => {
              if (icon === clickedControl) {
                icon.classList.add("active");
              } else {
                icon.classList.remove("active");
              }
            });
            needsRender = true;
          }
          // Rarity filter remains unchanged by element selection
        } else if (newRarityFilter) {
          // Clicked a Rarity image (5 Stars, 4 Stars)
          if (state.activeRarityFilter === newRarityFilter) {
            state.setActiveRarityFilter(null);
            clickedControl.classList.remove("active");
            // If no element filter is active (i.e., element filter is "All"), "All" button becomes active
            if (state.activeElementFilter === "All") {
              allButton.classList.add("active");
            }
            needsRender = true;
          } else {
            state.setActiveRarityFilter(newRarityFilter);
            allButton.classList.remove("active"); // Deactivate "All" if a specific rarity is chosen
            rarityFilterImgs.forEach((img) => {
              if (img === clickedControl) {
                img.classList.add("active");
              } else {
                img.classList.remove("active");
              }
            });
            needsRender = true;
          }
          // Element filter remains unchanged by rarity selection
        }

        if (needsRender) {
          console.log(
            `UI: Filters changed. Element: ${state.activeElementFilter}, Rarity: ${state.activeRarityFilter}. Re-rendering grid.`
          );
          if (typeof uiViews.applyCharacterFilter === "function") {
            uiViews.applyCharacterFilter(); // Call without arguments (it reads state internally)
          } else {
            console.error("applyCharacterFilter function not found in uiViews");
          }
        }
      });
    });

    // Initial visual setup for "All" button
    if (allButton) {
      allButton.classList.add("active");
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

  if (elements.boxScoreLeaveSlotBtn) {
    // Check if the element exists
    elements.boxScoreLeaveSlotBtn.addEventListener("click", () => {
      console.log("Host: Leave Player Slot button clicked (from BSS).");
      // Verify user is host and currently in a slot
      if (
        state.isCurrentUserHost &&
        (state.myAssignedSlot === "P1" || state.myAssignedSlot === "P2") &&
        state.currentLobbyId
      ) {
        sendMessageToServer({
          action: "hostLeaveSlot", // Same action as the button on the wait screen
          lobbyId: state.currentLobbyId,
        });
        // UI update will be handled by the lobbyStateUpdate message received back from the server.
        // The server should set the host's slot to null, clear their player-specific BSS data,
        // and the client should then likely navigate to the lobby-wait-screen.
      } else {
        console.warn(
          "BSS Leave slot button clicked, but conditions not met (not host, not in slot, or no lobbyId)."
        );
      }
    });

  } else {
    console.warn(
      "Host Leave Slot Button on BSS (boxScoreLeaveSlotBtn) not found during listener setup."
    );
  }
  // --- END HOST CONTROL LISTENERS ---

  // --- Show Initial Screen ---
  showScreen("welcome-screen");
  console.log("Main script initialization complete.");

  // TEMPORARY FOR TESTING BOX SCORE SCREEN
  // Use the setter function from state.js
  // state.setLobbyInfo("testLobby123", true, "P1"); // This will set isCurrentUserHost and myAssignedSlot
  // showScreen('box-score-screen'); // UNCOMMENT TO TEST
  // END TEMPORARY

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
        resetStartLobbyButton(); // Reset the Start Lobby button
        showScreen("welcome-screen");
      }
    } else {
      // Regular players just leave
      sendMessageToServer({
        action: "leaveLobby",
        lobbyId: state.currentLobbyId,
      });
      state.clearLobbyState();
      resetStartLobbyButton(); // Reset the Start Lobby button
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
      resetStartLobbyButton(); // Reset the Start Lobby button
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

  // Add event listener for reset sequences button
  if (elements.resetLocalSequencesBtn) {
    elements.resetLocalSequencesBtn.addEventListener("click", () => {
      console.log("MAIN_JS: 'Reset Inputs' button clicked on BSS.");
      if (
        confirm(
          "Are you sure you want to reset all sequence inputs on this page to 'Not Owned'? This will also clear any remembered sequences from this browser for this tool."
        )
      ) {
        try {
          localStorage.removeItem(LOCAL_STORAGE_SEQUENCES_KEY);
          console.log("MAIN_JS: Cleared saved sequences from localStorage.");
        } catch (e) {
          console.warn(
            "MAIN_JS: Could not remove sequences from localStorage.",
            e
          );
        }

        // Repopulate the BSS screen to reflect defaults
        if (typeof uiViews.populateBoxScoreScreen === "function") {
          uiViews.populateBoxScoreScreen();
        } else {
          console.error(
            "MAIN_JS_ERROR: uiViews.populateBoxScoreScreen function not found!"
          );
        }
        alert("Sequence inputs have been reset to default ('Not Owned').");
      }
    });
  } else {
    console.warn(
      "MAIN_JS_WARN: resetLocalSequencesBtn element not found during listener setup."
    );
  }
}); // End of DOMContentLoaded listener
