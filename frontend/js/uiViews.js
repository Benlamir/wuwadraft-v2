// frontend/js/uiViews.js
import { elements } from "./uiElements.js";
import * as state from "./state.js"; // Use state variables
import { sendMessageToServer } from "./websocket.js"; // Import function to send messages
import { ALL_RESONATORS_DATA } from "./resonatorData.js";

// --- Screen Navigation ---
export function showScreen(screenIdToShow) {
  if (!elements.screensNodeList) {
    console.error("Screens NodeList not initialized yet in uiViews!");
    return;
  }
  console.log(`UI: Navigating to screen: ${screenIdToShow}`);

  // --- Toggle Header Visibility ---
  if (elements.header) {
    if (screenIdToShow === "draft-screen") {
      elements.header.classList.add("visually-hidden");
    } else {
      elements.header.classList.remove("visually-hidden");
    }
  } else {
    console.warn("UI: Header element not found, cannot toggle visibility.");
  }

  // --- Toggle Background Class ---
  if (screenIdToShow === "draft-screen") {
    console.log("UI: Adding draft background class to body.");
    document.body.classList.add("draft-active-background");
  } else {
    console.log("UI: Removing draft background class from body.");
    document.body.classList.remove("draft-active-background");
  }

  // Screen switching logic
  elements.screensNodeList.forEach((screen) => {
    if (screen) screen.classList.remove("active");
  });
  const screenToShow = document.getElementById(screenIdToShow);
  if (screenToShow && screenToShow.classList.contains("screen")) {
    screenToShow.classList.add("active");
  } else {
    console.error(
      `Screen with ID ${screenIdToShow} not found or missing 'screen' class! Falling back to welcome.`
    );
    elements.welcomeScreen?.classList.add("active");
  }
}

// --- UI Update Functions ---

export function updateLobbyWaitScreenUI(lobbyStateData) {
  console.log("UI: Updating lobby wait screen", lobbyStateData);

  // Update Lobby ID display (handle initial hidden state)
  if (elements.lobbyIdDisplay) {
    elements.lobbyIdDisplay.textContent = "••••••••";
    // Reset icon on updates too
    const icon = elements.toggleLobbyIdDisplayBtn?.querySelector("i");
    if (icon) {
      icon.classList.remove("bi-eye-slash-fill");
      icon.classList.add("bi-eye-fill");
    }
  }

  // Update Names
  if (elements.hostNameDisplay)
    elements.hostNameDisplay.textContent = lobbyStateData.hostName || "[Host]";
  if (elements.player1NameDisplay)
    elements.player1NameDisplay.textContent =
      lobbyStateData.player1Name || "Waiting...";
  if (elements.player2NameDisplay)
    elements.player2NameDisplay.textContent =
      lobbyStateData.player2Name || "Waiting...";

  // Add "(You)" suffix based on assigned slot
  if (
    state.myAssignedSlot === "P1" &&
    elements.player1NameDisplay &&
    lobbyStateData.player1Name
  ) {
    elements.player1NameDisplay.textContent += " (You)";
  } else if (
    state.myAssignedSlot === "P2" &&
    elements.player2NameDisplay &&
    lobbyStateData.player2Name
  ) {
    elements.player2NameDisplay.textContent += " (You)";
  } else if (
    state.isCurrentUserHost &&
    elements.hostNameDisplay &&
    lobbyStateData.hostName
  ) {
    // Check if host is ALSO a player - might need more complex logic if Host can play
    if (state.myAssignedSlot !== "P1" && state.myAssignedSlot !== "P2") {
      // Only add if host isn't P1/P2
      elements.hostNameDisplay.textContent += " (Host)";
    }
  }

  // Update Status Icons & Text
  const readyIconHTML = '<i class="bi bi-check-circle-fill"></i>';
  const notReadyIconHTML = '<i class="bi bi-hourglass-split"></i>'; // Or choose another icon

  if (elements.player1StatusElement) {
    const isReady = lobbyStateData.player1Ready === true;
    elements.player1StatusElement.innerHTML = isReady
      ? readyIconHTML
      : notReadyIconHTML;
    elements.player1StatusElement.className = "player-status ms-2 "; // Reset classes
    elements.player1StatusElement.classList.add(
      isReady ? "text-success" : "text-light"
    );
  }
  if (elements.player2StatusElement) {
    const isReady = lobbyStateData.player2Ready === true;
    elements.player2StatusElement.innerHTML = isReady
      ? readyIconHTML
      : notReadyIconHTML;
    elements.player2StatusElement.className = "player-status ms-2 "; // Reset classes
    elements.player2StatusElement.classList.add(
      isReady ? "text-success" : "text-light"
    );
  }

  // Update Lobby Status Text
  if (elements.lobbyStatusDisplay) {
    elements.lobbyStatusDisplay.textContent =
      lobbyStateData.lobbyState || "WAITING";
    // Could customize message more based on state
  }

  // Update Ready Buttons visibility/state
  if (elements.player1ReadyBtn) {
    const showP1Btn =
      state.myAssignedSlot === "P1" && lobbyStateData.player1Ready !== true;
    elements.player1ReadyBtn.style.display = showP1Btn
      ? "inline-block"
      : "none";
    elements.player1ReadyBtn.disabled = !showP1Btn;
  }
  if (elements.player2ReadyBtn) {
    const showP2Btn =
      state.myAssignedSlot === "P2" && lobbyStateData.player2Ready !== true;
    elements.player2ReadyBtn.style.display = showP2Btn
      ? "inline-block"
      : "none";
    elements.player2ReadyBtn.disabled = !showP2Btn;
  }

  // Show/Hide Host/Player Controls (simplified)
  if (elements.hostControls)
    elements.hostControls.style.display = state.isCurrentUserHost
      ? "block"
      : "none";
  if (elements.playerControls)
    elements.playerControls.style.display = !state.isCurrentUserHost
      ? "block"
      : "none"; // Show if not host
}

// --- ADD HELPER FUNCTION ---
function findResonatorByName(name) {
  return ALL_RESONATORS_DATA.find((resonator) => resonator.name === name);
}
// --- END HELPER FUNCTION ---

// --- ADD NEW FUNCTION for Pick Slots ---
function updatePickSlots(draftState) {
  const p1Picks = draftState.player1Picks || [];
  const p2Picks = draftState.player2Picks || [];

  // Assuming 3 pick slots per player for now
  const p1SlotElements = [elements.p1Pick1, elements.p1Pick2, elements.p1Pick3];
  const p2SlotElements = [elements.p2Pick1, elements.p2Pick2, elements.p2Pick3];

  // Update Player 1 slots
  p1SlotElements.forEach((slot, index) => {
    if (!slot) return; // Skip if element wasn't found
    const pickName = p1Picks[index];
    if (pickName) {
      const resonator = findResonatorByName(pickName);
      if (resonator && resonator.image_pick) {
        slot.innerHTML = `<img src="${resonator.image_pick}" alt="${resonator.name}" title="${resonator.name}" style="width: 100%; height: 100%; object-fit: contain;">`; // Use contain for portrait picks
        slot.style.border = "1px solid #66f"; // Example: Add border to filled slot
      } else {
        slot.innerHTML = `<span>?</span>`; // Fallback if image not found
        slot.style.border = "1px dashed rgba(255, 255, 255, 0.3)";
      }
    } else {
      slot.innerHTML = ""; // Clear slot if no pick for this index
      slot.style.border = "1px dashed rgba(255, 255, 255, 0.3)"; // Reset border
    }
  });

  // Update Player 2 slots
  p2SlotElements.forEach((slot, index) => {
    if (!slot) return;
    const pickName = p2Picks[index];
    if (pickName) {
      const resonator = findResonatorByName(pickName);
      if (resonator && resonator.image_pick) {
        slot.innerHTML = `<img src="${resonator.image_pick}" alt="${resonator.name}" title="${resonator.name}" style="width: 100%; height: 100%; object-fit: contain;">`;
        slot.style.border = "1px solid #f66"; // Example: Add border to filled slot
      } else {
        slot.innerHTML = `<span>?</span>`;
        slot.style.border = "1px dashed rgba(255, 255, 255, 0.3)";
      }
    } else {
      slot.innerHTML = "";
      slot.style.border = "1px dashed rgba(255, 255, 255, 0.3)";
    }
  });
}
// --- END Pick Slot Function ---

// --- ADD NEW FUNCTION for Ban Slots ---
function updateBanSlots(draftState) {
  const bans = draftState.bans || [];
  // Use the NodeList directly if using querySelectorAll, or build array from IDs
  const banSlotElements = elements.banSlots || [
    elements.banSlot1,
    elements.banSlot2,
    elements.banSlot3,
    elements.banSlot4,
  ]; // Use querySelectorAll result or array of IDs

  banSlotElements.forEach((slot, index) => {
    if (!slot) return; // Skip if element somehow null/undefined
    const banName = bans[index];
    if (banName) {
      const resonator = findResonatorByName(banName);
      // Use smaller button image for bans? Or pick image? Let's use button image.
      if (resonator && resonator.image_button) {
        slot.innerHTML = `<img src="${resonator.image_button}" alt="${banName}" title="${banName}" style="max-width: 90%; max-height: 90%; object-fit: cover; border-radius: 3px;">`;
        slot.style.borderColor = "#888"; // Example style change
        slot.style.backgroundColor = "rgba(255, 50, 50, 0.2)";
      } else {
        slot.innerHTML = `<span>X</span>`; // Fallback
        slot.style.borderColor = "rgba(255, 255, 255, 0.3)";
        slot.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
      }
    } else {
      slot.innerHTML = ""; // Clear slot
      // Reset styles if needed
      slot.style.borderColor = "rgba(255, 255, 255, 0.3)";
      slot.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
    }
  });
}
// --- END Ban Slot Function ---

// --- ADD TIMER DISPLAY FUNCTIONS ---

export function stopTimerDisplay() {
  //console.log(
  //  `UI DEBUG: stopTimerDisplay START. Current state interval ID: ${state.timerIntervalId}`
  //);
  // Call the state function which now handles both clearing and nulling
  state.clearTimerInterval();

  // Reset display text immediately
  if (elements.draftTimer) {
    elements.draftTimer.textContent = "Time Remaining: --:--";
    elements.draftTimer.classList.remove("text-danger", "fw-bold");
    // console.log("UI DEBUG: stopTimerDisplay reset timer text.");
  }
}

// This internal function updates the clock display
function updateCountdown(expiryTime, intervalId) {
  // --- ADD state import for clarity ---
  const {
    myAssignedSlot,
    currentTurn,
    currentPhase,
    timerIntervalId: activeTimerId,
  } = state;
  // --- END ADD ---

  console.log(
    `UI DEBUG: updateCountdown TICK for interval ID ${intervalId}. Active state ID: ${activeTimerId}`
  );

  if (intervalId !== activeTimerId) {
    console.log(
      `UI DEBUG: Stale timer callback DETECTED (ID ${intervalId}, Active ID ${activeTimerId}). Clearing ${intervalId} and exiting.`
    );
    clearInterval(intervalId);
    return;
  }

  const now = Date.now();
  const remainingMs = expiryTime - now;

  if (remainingMs <= 0) {
    if (elements.draftTimer) {
      elements.draftTimer.textContent = "Time Remaining: 00:00";
      elements.draftTimer.classList.add("text-danger", "fw-bold");
    }

    // Clear the interval FIRST to stop the countdown updates
    clearInterval(intervalId); // Clear this specific interval ID
    console.log(
      `UI: Timer visually reached zero (Interval ID: ${intervalId}). Clearing interval.`
    );

    // --- ADD CHECK: Only send timeout if it's MY turn ---
    if (myAssignedSlot === currentTurn) {
      console.log(
        `UI: It's MY turn (${myAssignedSlot}), waiting briefly before sending timeout.`
      );
      // Use setTimeout to introduce a small delay (e.g., 500ms)
      setTimeout(() => {
        // Optional: Re-check if turn hasn't changed *during* the 500ms delay
        if (state.currentTurn === myAssignedSlot) {
          console.log(
            `UI: Sending timeout action after delay. Expected Phase: ${state.currentPhase}, Expected Turn: ${myAssignedSlot}` // Use myAssignedSlot here too
          );
          sendMessageToServer({
            action: "turnTimeout",
            expectedPhase: state.currentPhase, // Send phase from current state
            expectedTurn: myAssignedSlot, // Send MY slot as the expected turn
          });
        } else {
          console.log(
            `UI: Timeout send cancelled. Turn changed to ${state.currentTurn} during delay.`
          );
        }
      }, 500); // Delay sending by 500 milliseconds
    } else {
      console.log(
        `UI: Timer expired, but it was not my turn (${myAssignedSlot} vs ${currentTurn}). Not sending timeout action.`
      );
      // If it wasn't my turn, we don't send the timeout.
      // We might rely on the other player's client to send it,
      // or potentially a future server-side check if needed.
    }
    // --- END CHECK ---

    // Note: We cleared the interval outside the check/setTimeout
  } else {
    const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const displayString = `Time Remaining: ${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;

    if (elements.draftTimer) {
      elements.draftTimer.textContent = displayString;
      if (remainingSeconds <= 10) {
        elements.draftTimer.classList.add("text-danger", "fw-bold");
      } else {
        elements.draftTimer.classList.remove("text-danger", "fw-bold");
      }
    } else {
      console.warn(
        `UI DEBUG: updateCountdown (ID ${intervalId}) - elements.draftTimer is null/undefined!`
      );
    }
  }
}

// This function starts a new timer cycle
export function startOrUpdateTimerDisplay() {
  //console.log("UI DEBUG: startOrUpdateTimerDisplay START.");
  stopTimerDisplay(); // Ensure previous timer is stopped & state ID is nulled

  //console.log(
  //  `UI DEBUG: Reading state.currentTurnExpiresAt: ${state.currentTurnExpiresAt}`
  //);

  if (!state.currentTurnExpiresAt) {
    //console.log("UI DEBUG: No expiry time set in state, timer not starting.");
    return;
  }

  try {
    const expiryTimestamp = new Date(state.currentTurnExpiresAt).getTime();
    //console.log(
    //  `UI DEBUG: Parsed expiryTimestamp: ${expiryTimestamp} (isNaN: ${isNaN(
    //    expiryTimestamp
    //  )})`
    //);

    if (isNaN(expiryTimestamp)) {
      //console.error(
      //  "UI DEBUG: Invalid expiry timestamp received from state:",
      //  state.currentTurnExpiresAt
      //);
      return;
    }

    const now = Date.now();
    //console.log(
    //  `UI DEBUG: Comparing expiry ${expiryTimestamp} with now ${now}`
    //);

    if (expiryTimestamp <= now) {
      //console.log(
      //  "UI DEBUG: Expiry time is in the past. Setting timer to 00:00."
      //);
      if (elements.draftTimer) {
        elements.draftTimer.textContent = "Time Remaining: 00:00";
        elements.draftTimer.classList.add("text-danger", "fw-bold");
      }
      return;
    }

    //console.log(`UI DEBUG: Starting new timer interval...`);

    const newIntervalId = setInterval(() => {
      // Pass expiryTimestamp (parsed time) and newIntervalId
      updateCountdown(expiryTimestamp, newIntervalId);
    }, 1000);

    //console.log(
    //  `UI DEBUG: New interval created with ID: ${newIntervalId}. Storing in state via function.`
    //);
    state.setTimerIntervalId(newIntervalId); // Call the function in state.js instead

    //console.log(
    //  `UI DEBUG: Calling updateCountdown immediately once for ID ${newIntervalId}.`
    //);
    updateCountdown(expiryTimestamp, newIntervalId); // Run immediately
  } catch (e) {
    // Log the error WITH the stack trace
    //console.error("UI DEBUG: Error during timer start:", e);
    stopTimerDisplay();
  }
}

// --- END TIMER DISPLAY FUNCTIONS ---

// --- MODIFY updateDraftScreenUI FUNCTION ---
export function updateDraftScreenUI(draftState) {
  //console.log("UI: Updating draft screen UI with state:", draftState);
  if (!elements || !elements.draftScreen) {
    //console.error(
    //  "UI Update Error: elements object or draftScreen element not initialized!"
    //);
    return;
  }

  // --- ADD HANDLING FOR DRAFT COMPLETE STATE ---
  if (draftState.currentPhase === "DRAFT_COMPLETE") {
    console.log("UI: Rendering Draft Complete state.");
    if (elements.draftPhaseStatus) {
      elements.draftPhaseStatus.textContent = "Draft Complete!";
      elements.draftPhaseStatus.classList.add("text-success", "fw-bold"); // Example styling
    }
    if (elements.draftTimer) {
      elements.draftTimer.textContent = ""; // Clear timer text
    }
    // Ensure final picks/bans are rendered
    updatePickSlots(draftState);
    updateBanSlots(draftState);

    // Disable character grid entirely
    if (elements.characterGridContainer) {
      elements.characterGridContainer.innerHTML =
        '<p class="text-center text-muted fst-italic mt-4">-- Draft Finished --</p>'; // Replace grid content
      // OR disable all buttons within it if preferred
      // const allButtons = elements.characterGridContainer.querySelectorAll('button');
      // allButtons.forEach(btn => btn.disabled = true);
    }
    // Optionally hide filter controls
    const filterControls = document.getElementById("draft-filter-controls");
    if (filterControls) filterControls.style.display = "none";

    // Optionally add a 'Back to Lobby/Welcome' button or message here
    // (Requires further logic)

    stopTimerDisplay(); // Explicitly stop timer on completion
    return; // Stop further UI updates for active turn display etc.
  }
  // --- END DRAFT COMPLETE HANDLING ---

  // --- Original UI Update Logic (for ongoing draft) ---
  // Update Phase and Turn Status (This will now only run if draft is NOT complete)
  if (elements.draftPhaseStatus) {
    // Reset any completion styling if somehow reapplied
    elements.draftPhaseStatus.classList.remove("text-success", "fw-bold");

    const turnPlayerName =
      draftState.currentTurn === "P1"
        ? draftState.player1Name || "Player 1"
        : draftState.player2Name || "Player 2";
    const turnIndicator =
      state.myAssignedSlot === draftState.currentTurn ? " (Your Turn)" : "";
    elements.draftPhaseStatus.textContent = `Phase: ${
      draftState.currentPhase || "N/A"
    } (${turnPlayerName}'s Turn)${turnIndicator}`;
  } else {
    console.warn("UI Update Warning: Draft phase status element not found");
  }

  // Update Player Names (Keep)
  if (elements.draftP1Name) {
    elements.draftP1Name.textContent = draftState.player1Name || "[P1 Name]";
  }
  if (elements.draftP2Name) {
    elements.draftP2Name.textContent = draftState.player2Name || "[P2 Name]";
  }

  // Update Timer (Keep placeholder)
  // if (elements.draftTimer) { ... }

  // Update Pick and Ban Slots (Keep)
  updatePickSlots(draftState);
  updateBanSlots(draftState);

  // Re-enable filter controls if they were hidden
  const filterControls = document.getElementById("draft-filter-controls");
  if (filterControls) filterControls.style.display = "flex"; // Or original display value

  // Render Character Grid (Keep)
  try {
    renderCharacterGrid(draftState); // Render grid based on current non-complete state
  } catch (gridError) {
    console.error("Error calling renderCharacterGrid:", gridError);
  }
}
// --- END FUNCTION MODIFICATION ---

// --- UI Initializers run from main.js after DOMContentLoaded ---

export function initializePasswordToggle() {
  if (elements.toggleLobbyIdVisibilityBtn && elements.joinLobbyIdInput) {
    elements.toggleLobbyIdVisibilityBtn.addEventListener("click", () => {
      const icon = elements.toggleLobbyIdVisibilityBtn.querySelector("i");
      const currentType = elements.joinLobbyIdInput.getAttribute("type");
      if (currentType === "password") {
        elements.joinLobbyIdInput.setAttribute("type", "text");
        if (icon) {
          icon.classList.remove("bi-eye-fill");
          icon.classList.add("bi-eye-slash-fill");
        }
      } else {
        elements.joinLobbyIdInput.setAttribute("type", "password");
        if (icon) {
          icon.classList.remove("bi-eye-slash-fill");
          icon.classList.add("bi-eye-fill");
        }
      }
    });
    console.log("UI: Password toggle listener attached.");
  } else {
    console.warn(
      "UI: Could not attach password toggle listener (elements missing)."
    );
  }
}

export function initializeLobbyIdToggle() {
  if (elements.toggleLobbyIdDisplayBtn && elements.lobbyIdDisplay) {
    elements.toggleLobbyIdDisplayBtn.addEventListener("click", () => {
      const icon = elements.toggleLobbyIdDisplayBtn.querySelector("i");
      const currentText = elements.lobbyIdDisplay.textContent;
      if (currentText === "••••••••") {
        elements.lobbyIdDisplay.textContent = state.currentLobbyId || "Error"; // Use stored state
        if (icon) {
          icon.classList.remove("bi-eye-fill");
          icon.classList.add("bi-eye-slash-fill");
        }
      } else {
        elements.lobbyIdDisplay.textContent = "••••••••";
        if (icon) {
          icon.classList.remove("bi-eye-slash-fill");
          icon.classList.add("bi-eye-fill");
        }
      }
    });
    console.log("UI: Lobby ID display toggle listener attached.");
  } else {
    console.warn(
      "UI: Could not attach lobby ID display toggle listener (elements missing)."
    );
  }
}

export function initializeCopyButton() {
  if (elements.copyLobbyIdBtn) {
    elements.copyLobbyIdBtn.addEventListener("click", async () => {
      if (state.currentLobbyId && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(state.currentLobbyId);
          const icon = elements.copyLobbyIdBtn.querySelector("i");
          if (icon) {
            icon.classList.remove("bi-clipboard");
            icon.classList.add("bi-clipboard-check");
            setTimeout(() => {
              icon.classList.remove("bi-clipboard-check");
              icon.classList.add("bi-clipboard");
            }, 2000);
          }
        } catch (error) {
          console.error("Failed to copy lobby ID:", error);
        }
      }
    });
    console.log("UI: Copy button listener attached.");
  } else {
    console.warn(
      "UI: Could not attach copy button listener (elements missing)."
    );
  }
}

export function applyCharacterFilter(filterElement) {
  console.log(`UI: Applying filter: ${filterElement}`);
  state.setActiveElementFilter(filterElement); // Update state

  // Re-render the grid using the latest stored draft state
  if (state.currentDraftState) {
    renderCharacterGrid(state.currentDraftState); // Re-render with the new filter active
  } else {
    console.warn("Cannot re-render grid, current draft state unknown.");
    if (elements.characterGridContainer)
      elements.characterGridContainer.innerHTML =
        '<p class="text-warning">Cannot display characters: draft state not loaded yet.</p>';
  }
}

function renderCharacterGrid(draftState) {
  if (!elements.characterGridContainer) {
    console.error("UI Error: characterGridContainer element not found!");
    return;
  }

  // Get active filter from state
  const activeFilter = state.activeElementFilter || "All";
  console.log(`UI: Rendering grid with filter: ${activeFilter}`);

  console.log(
    "UI: Rendering character grid. Raw draftState:",
    draftState // Log the full state for debugging
  );
  elements.characterGridContainer.innerHTML = ""; // Clear previous grid

  // Ensure draftState has the necessary fields, provide defaults if missing
  const availableResonators = draftState.availableResonators || [];
  const player1Picks = draftState.player1Picks || [];
  const player2Picks = draftState.player2Picks || [];
  const bans = draftState.bans || [];
  const currentTurn = draftState.currentTurn || state.currentTurn; // Use state from message if available, else local state

  const isMyTurn = state.myAssignedSlot === currentTurn;
  console.log(
    `UI: Rendering grid. Is it my turn? ${isMyTurn} (MySlot: ${state.myAssignedSlot}, CurrentTurn: ${currentTurn})`
  );

  const availableSet = new Set(availableResonators);
  const p1PicksSet = new Set(player1Picks);
  const p2PicksSet = new Set(player2Picks);
  const bansSet = new Set(bans);

  // Filter ALL_RESONATORS_DATA based on the activeFilter
  const resonatorsToDisplay =
    activeFilter === "All"
      ? ALL_RESONATORS_DATA
      : ALL_RESONATORS_DATA.filter(
          (resonator) =>
            Array.isArray(resonator.element) &&
            resonator.element.includes(activeFilter) // Check element is array and includes filter
        );

  if (resonatorsToDisplay.length === 0 && activeFilter !== "All") {
    elements.characterGridContainer.innerHTML = `<p class="text-center text-muted fst-italic">No resonators match the '${activeFilter}' filter.</p>`;
  } else if (
    resonatorsToDisplay.length === 0 &&
    ALL_RESONATORS_DATA.length > 0
  ) {
    // Should not happen unless ALL_RESONATORS_DATA is empty
    elements.characterGridContainer.innerHTML = `<p class="text-center text-danger">Error: No resonators found.</p>`;
  }

  // Loop over the filtered list
  resonatorsToDisplay.forEach((resonator) => {
    const button = document.createElement("button");
    button.classList.add("character-button", "stylish-button"); // Add base classes
    button.dataset.resonatorId = resonator.id; // Use resonator.id if defined in data
    button.dataset.resonatorName = resonator.name; // Use resonator.name

    // Ensure image source exists
    const imgSrc = resonator.image_button || ""; // Use button image, provide fallback
    button.innerHTML = `<img src="${imgSrc}" alt="${resonator.name}" title="${resonator.name}" onerror="this.style.display='none'; this.parentElement.textContent='?';" />`; // Add basic error handling for image load

    // Determine button state based on draftState
    let isAvailable = availableSet.has(resonator.name);
    let isPickedByP1 = p1PicksSet.has(resonator.name);
    let isPickedByP2 = p2PicksSet.has(resonator.name);
    let isBanned = bansSet.has(resonator.name);
    let isUnavailable = isPickedByP1 || isPickedByP2 || isBanned;

    // --- ADD DEBUG LOG ---
    if (resonator.name === "Yuanwu") {
      // Or the name you are testing with
      console.log(
        `DEBUG (${resonator.name}): isBanned=${isBanned}, isPickedP1=${isPickedByP1}, isPickedP2=${isPickedByP2}, isAvailable=${isAvailable}, availableSet:`,
        availableSet,
        "bansSet:",
        bansSet
      );
    }
    // --- END DEBUG LOG ---

    // Remove previous state classes
    button.classList.remove(
      "available",
      "unavailable",
      "picked-p1",
      "picked-p2",
      "banned",
      "just-selected"
    );

    // Apply new state classes for styling
    if (isPickedByP1) {
      button.classList.add("unavailable", "picked-p1");
    } else if (isPickedByP2) {
      button.classList.add("unavailable", "picked-p2");
    } else if (isBanned) {
      button.classList.add("unavailable", "banned");
    } else if (isAvailable) {
      button.classList.add("available");
    } else {
      // If not available, and not picked/banned (shouldn't happen with correct availableResonators list)
      button.classList.add("unavailable");
    }

    // Determine if this specific button should be clickable
    // Condition: Is it my turn? AND Is the character available? AND Not already picked/banned?
    const isClickable = isMyTurn && isAvailable && !isUnavailable;

    // Set disabled state
    button.disabled = !isClickable;

    // Add listener ONLY if clickable
    if (isClickable) {
      // Remove previous listener to prevent duplicates if grid re-renders often
      // button.removeEventListener("click", handleCharacterSelection); // Not strictly needed if clearing innerHTML
      button.addEventListener("click", handleCharacterSelection);
    } else {
      // Optionally add a 'not-clickable' class for styling disabled buttons differently
      button.classList.add("not-clickable");
    }

    elements.characterGridContainer.appendChild(button);
  });
}

// Add other UI specific functions here (e.g., renderCharacterGrid later)

function handleCharacterSelection(event) {
  const button = event.currentTarget;
  const resonatorName = button.dataset.resonatorName;

  if (!resonatorName) {
    console.error(
      "Character button clicked, but missing resonator name dataset!"
    );
    return;
  }

  // Disable button immediately to prevent double clicks
  button.disabled = true;
  button.classList.add("just-selected"); // Optional: temporary visual feedback

  // Determine action based on current phase from state
  let action = null;
  const phase = state.currentPhase; // Get phase from state.js module

  if (phase?.startsWith("BAN")) {
    action = "makeBan";
  } else if (phase?.startsWith("PICK")) {
    action = "makePick";
  } else {
    console.error(`Unknown phase (${phase}) - cannot determine action.`);
    // Re-enable button if phase is unknown? Or leave disabled?
    button.disabled = false; // Let's re-enable for now
    button.classList.remove("just-selected");
    return; // Don't send message
  }

  // Construct and send message
  const message = {
    action: action,
    resonatorName: resonatorName,
    // Lobby ID is not needed, backend gets it from connectionId
  };
  console.log(`UI: Sending action: ${action}, Resonator: ${resonatorName}`);
  sendMessageToServer(message);

  // --- COMMENT OUT FOLLOW-UP TEST MESSAGE ---
  /*
  console.log("UI: Sending follow-up test message");
  sendMessageToServer({
    action: "testAfterAction",
    originalAction: action,
    resonator: resonatorName,
  });
  */
  // --- END COMMENT OUT ---

  // Note: The button state (disabled, class) will be fully updated
  // when the lobbyStateUpdate message comes back from the server.
  // The immediate disabling is just for quick feedback.

  // --- ADDITION: Disable ALL character buttons immediately ---
  console.log("UI: Disabling all character buttons pending state update.");
  const allCharacterButtons =
    elements.characterGridContainer?.querySelectorAll(".character-button");
  if (allCharacterButtons) {
    allCharacterButtons.forEach((btn) => {
      btn.disabled = true;
      // Optional: Add a visual style to indicate they are waiting for update
      // btn.style.opacity = '0.5';
    });
  }
  // --- END ADDITION ---
}
