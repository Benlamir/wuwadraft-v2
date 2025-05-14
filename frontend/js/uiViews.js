// frontend/js/uiViews.js
import { elements } from "./uiElements.js";
import * as state from "./state.js"; // Use state variables
import { sendMessageToServer } from "./websocket.js"; // Import function to send messages
import { ALL_RESONATORS_DATA, SEQUENCE_POINTS } from "./resonatorData.js";

// --- ADD HELPER FUNCTION ---
// Helper function to toggle visibility using Bootstrap's d-none class
function toggleElementVisibility(element, show) {
  if (element) {
    if (show) {
      element.classList.remove("d-none");
    } else {
      element.classList.add("d-none");
    }
  } else {
    // Optional: Log if the element wasn't found during initialization
    // console.warn("Attempted to toggle visibility on a non-existent element.");
  }
}
// --- END HELPER FUNCTION ---

// --- Screen Navigation ---
export function showScreen(screenIdToShow) {
  if (!elements.screensNodeList) {
    console.error("Screens NodeList not initialized yet in uiViews!");
    return;
  }

  // --- Toggle Background Class ---
  if (screenIdToShow === "draft-screen") {
    document.body.classList.add("draft-active-background");
  } else {
    document.body.classList.remove("draft-active-background");
  }

  // Screen switching logic
  elements.screensNodeList.forEach((screen) => {
    if (screen) screen.classList.remove("active");
  });
  const screenToShow = document.getElementById(screenIdToShow);
  if (screenToShow && screenToShow.classList.contains("screen")) {
    screenToShow.classList.add("active");

    // --- NEW LOGIC FOR BOX SCORE SCREEN ---
    if (screenIdToShow === "box-score-screen") {
      populateBoxScoreScreen(); // Populate when shown
      // Manage visibility of host's "Leave Player Slot" button on this screen
      if (
        state.isCurrentUserHost &&
        (state.myAssignedSlot === "P1" || state.myAssignedSlot === "P2")
      ) {
        toggleElementVisibility(elements.boxScoreLeaveSlotBtn, true);
      } else {
        toggleElementVisibility(elements.boxScoreLeaveSlotBtn, false);
      }
    } else {
      // Ensure host's leave slot button is hidden if not on box score screen
      toggleElementVisibility(elements.boxScoreLeaveSlotBtn, false);
    }
    // --- END NEW LOGIC ---
  } else {
    console.error(
      `Screen with ID ${screenIdToShow} not found or missing 'screen' class! Falling back to welcome.`
    );
    elements.welcomeScreen?.classList.add("active");
  }
}

// --- UI Update Functions ---

export function updateLobbyWaitScreenUI(lobbyStateData) {
  // console.log("UI: Updating lobby wait screen", lobbyStateData);

  // --- DEBUG: Verify all button elements exist ---
  // console.log("DEBUG: Verifying button elements...");
  // console.log("player1ReadyBtn exists:", !!elements.player1ReadyBtn);
  // console.log("player2ReadyBtn exists:", !!elements.player2ReadyBtn);
  // console.log("lobbyBackBtn exists:", !!elements.lobbyBackBtn);
  // console.log("hostDeleteLobbyBtn exists:", !!elements.hostDeleteLobbyBtn);
  // console.log("hostJoinSlotBtn exists:", !!elements.hostJoinSlotBtn);
  // console.log("hostKickP1Btn exists:", !!elements.hostKickP1Btn);
  // console.log("hostKickP2Btn exists:", !!elements.hostKickP2Btn);

  // --- Update Lobby ID Display ---
  if (elements.lobbyIdDisplay) {
    elements.lobbyIdDisplay.textContent = "••••••••"; // Keep it masked initially on updates
    const icon = elements.toggleLobbyIdDisplayBtn?.querySelector("i");
    if (icon) {
      icon.classList.remove("bi-eye-slash-fill");
      icon.classList.add("bi-eye-fill");
    }
  }

  // --- Update Names & (You) / (Host) Suffix ---
  const p1Name = lobbyStateData.player1Name || null;
  const p2Name = lobbyStateData.player2Name || null;
  // Use state.currentUserName for host's own name, fallback to server data for others
  const hostName = state.isCurrentUserHost
    ? state.currentUserName
    : lobbyStateData.hostName || "[Host]";

  if (elements.hostNameDisplay) elements.hostNameDisplay.textContent = hostName;
  if (elements.player1NameDisplay)
    elements.player1NameDisplay.textContent = p1Name || "Waiting...";
  if (elements.player2NameDisplay)
    elements.player2NameDisplay.textContent = p2Name || "Waiting...";

  if (state.isCurrentUserHost && elements.hostNameDisplay) {
    if (state.myAssignedSlot !== "P1" && state.myAssignedSlot !== "P2") {
      elements.hostNameDisplay.textContent += " (Host)";
    }
  }
  if (state.myAssignedSlot === "P1" && elements.player1NameDisplay && p1Name) {
    elements.player1NameDisplay.textContent += " (You)";
  } else if (
    state.myAssignedSlot === "P2" &&
    elements.player2NameDisplay &&
    p2Name
  ) {
    elements.player2NameDisplay.textContent += " (You)";
  }

  // --- Update Status Icons & Text ---
  const readyIconHTML = '<i class="bi bi-check-circle-fill"></i>';
  const notReadyIconHTML = '<i class="bi bi-hourglass-split"></i>';

  if (elements.player1StatusElement) {
    const isReady = lobbyStateData.player1Ready === true;
    elements.player1StatusElement.innerHTML = isReady
      ? readyIconHTML
      : notReadyIconHTML;
    elements.player1StatusElement.className = "player-status ms-2 ";
    elements.player1StatusElement.classList.add(
      isReady ? "text-success" : "text-light"
    );
  }
  if (elements.player2StatusElement) {
    const isReady = lobbyStateData.player2Ready === true;
    elements.player2StatusElement.innerHTML = isReady
      ? readyIconHTML
      : notReadyIconHTML;
    elements.player2StatusElement.className = "player-status ms-2 ";
    elements.player2StatusElement.classList.add(
      isReady ? "text-success" : "text-light"
    );
  }

  // --- Update Lobby Status Text (Including lastAction) ---
  if (elements.lobbyStatusDisplay) {
    // Remove ALL potentially conflicting styling classes first
    elements.lobbyStatusDisplay.classList.remove(
      "text-muted",
      "text-info", // Remove the default Bootstrap blue class
      "lobby-status-highlight", // Remove red pulse class
      "lobby-status-info" // Remove custom blue info class
    );

    if (lobbyStateData.lastAction) {
      const actionText = lobbyStateData.lastAction.toLowerCase(); // Use lowercase for matching
      elements.lobbyStatusDisplay.textContent = lobbyStateData.lastAction; // Set the text

      // Conditionally apply the correct styling class
      if (
        actionText.includes("left") ||
        actionText.includes("kicked") ||
        actionText.includes("reset") ||
        actionText.includes("timed out") ||
        actionText.includes("disconnected")
      ) {
        // Apply the red pulsing class for negative/warning events
        elements.lobbyStatusDisplay.classList.add("lobby-status-highlight");
        console.log("Applying lobby-status-highlight class"); // Debug log
      } else if (actionText.includes("joined as player")) {
        // Apply the blue info class for the host joining
        elements.lobbyStatusDisplay.classList.add("lobby-status-info");
        console.log("Applying lobby-status-info class"); // Debug log
      } else {
        // Default case for other lastAction messages (uses default text color)
        console.log(
          "Applying default style for lastAction:",
          lobbyStateData.lastAction
        );
      }
    } else {
      // No specific lastAction, show default status text based on lobbyState
      let statusText = lobbyStateData.lobbyState || "WAITING";
      if (statusText === "WAITING" && (!p1Name || !p2Name)) {
        statusText = "Waiting for players...";
      } else if (statusText === "WAITING" && p1Name && p2Name) {
        statusText = "Waiting for players to ready up...";
      }
      elements.lobbyStatusDisplay.textContent = statusText;
      // Optionally add back a default class like text-muted if desired for standard waiting messages
      // elements.lobbyStatusDisplay.classList.add("text-muted");
    }
  }

  // --- DEBUG: Log current state ---
  // console.log(
  //   `DEBUG Ready Check: mySlot=${state.myAssignedSlot}, P1 Ready=${lobbyStateData.player1Ready}, P2 Ready=${lobbyStateData.player2Ready}`
  // );
  // console.log("DEBUG: isCurrentUserHost =", state.isCurrentUserHost);

  // --- Update Button Visibility using d-none class ---
  const isHost = state.isCurrentUserHost;
  const mySlot = state.myAssignedSlot;

  // Player Ready Buttons
  if (elements.player1ReadyBtn) {
    const shouldShowP1Ready =
      mySlot === "P1" && lobbyStateData.player1Ready !== true;
    toggleElementVisibility(elements.player1ReadyBtn, shouldShowP1Ready);
    elements.player1ReadyBtn.disabled = !shouldShowP1Ready;
  }

  if (elements.player2ReadyBtn) {
    const shouldShowP2Ready =
      mySlot === "P2" && lobbyStateData.player2Ready !== true;
    toggleElementVisibility(elements.player2ReadyBtn, shouldShowP2Ready);
    elements.player2ReadyBtn.disabled = !shouldShowP2Ready;
  }

  // Player Back Button
  if (elements.lobbyBackBtn) {
    const shouldShowBackBtn = !isHost;
    toggleElementVisibility(elements.lobbyBackBtn, shouldShowBackBtn);
  }

  // --- Update Host Controls Visibility ---
  if (isHost) {
    // Show "Join Slot" button only if host is NOT in a slot AND a slot is free
    const hostIsInSlot = mySlot === "P1" || mySlot === "P2";
    const slotIsFree = !p1Name || !p2Name;
    toggleElementVisibility(
      elements.hostJoinSlotBtn,
      !hostIsInSlot && slotIsFree
    );

    // Show "Leave Slot" button only if host IS in a slot
    toggleElementVisibility(elements.hostLeaveSlotBtn, hostIsInSlot);

    // Keep existing logic for Delete and Kick buttons
    toggleElementVisibility(elements.hostDeleteLobbyBtn, true); // Always show delete for host
    toggleElementVisibility(elements.hostKickP1Btn, !!p1Name);
    toggleElementVisibility(elements.hostKickP2Btn, !!p2Name);
  } else {
    // Hide all host controls if not the host
    toggleElementVisibility(elements.hostJoinSlotBtn, false);
    toggleElementVisibility(elements.hostLeaveSlotBtn, false);
    toggleElementVisibility(elements.hostDeleteLobbyBtn, false);
    toggleElementVisibility(elements.hostKickP1Btn, false);
    toggleElementVisibility(elements.hostKickP2Btn, false);
  }
}

// --- ADD HELPER FUNCTION ---
function findResonatorByName(name) {
  return ALL_RESONATORS_DATA.find((resonator) => resonator.name === name);
}
// --- END HELPER FUNCTION ---

// Function to manage slot glow states
function updateSlotGlowState(slot, isActive, isFilled, type) {
  if (!slot) return;

  // Determine pulse class
  const pulseClass = isActive
    ? type === "ban"
      ? "pulse-ban"
      : "pulse-pick"
    : null;
  // Determine if static ban glow should be applied
  const showStaticBanGlow = type === "ban" && isFilled && !isActive;
  // Determine if static past pick style should be applied
  const showPastPickStyle = type === "pick" && isFilled && !isActive;

  // --- Glow/Pulse Logic ---
  // Remove all previous state classes first
  slot.classList.remove(
    "pulse-ban",
    "pulse-pick",
    "glow-ban",
    "glow-pick",
    "past-pick"
  );

  // 1. Apply PULSE if it's the currently active slot
  if (pulseClass) {
    slot.classList.add(pulseClass);
  }
  // 2. Apply static BAN glow if it's a filled ban slot (and not active)
  else if (showStaticBanGlow) {
    slot.classList.add("glow-ban");
  }
  // 3. Apply static PAST PICK style if it's a filled pick slot (and not active)
  else if (showPastPickStyle) {
    slot.classList.add("past-pick");
  }
  // 4. Otherwise (empty, non-active slot), no class is added, showing the default dashed border.
}

// --- ADD NEW FUNCTION for Pick Slots ---
function updatePickSlots(draftState) {
  const p1Picks = draftState.player1Picks || [];
  const p2Picks = draftState.player2Picks || [];
  const currentPhase = draftState.currentPhase;
  const currentTurn = draftState.currentTurn;

  // Assuming 3 pick slots per player for now
  const p1SlotElements = [elements.p1Pick1, elements.p1Pick2, elements.p1Pick3];
  const p2SlotElements = [elements.p2Pick1, elements.p2Pick2, elements.p2Pick3];

  // Update Player 1 slots
  p1SlotElements.forEach((slot, index) => {
    if (!slot) return; // Skip if element wasn't found
    const pickName = p1Picks[index];
    const isActive =
      currentPhase?.startsWith("PICK") &&
      currentTurn === "P1" &&
      !pickName &&
      index === p1Picks.length;

    if (pickName) {
      const resonator = findResonatorByName(pickName);
      if (resonator && resonator.image_pick) {
        slot.innerHTML = `<img src="${resonator.image_pick}" alt="${resonator.name}" title="${resonator.name}" style="width: 100%; height: 100%; object-fit: contain;">`;
      } else {
        slot.innerHTML = `<span>?</span>`;
      }
    } else {
      slot.innerHTML = "";
    }

    updateSlotGlowState(slot, isActive, !!pickName, "pick");
  });

  // Update Player 2 slots
  p2SlotElements.forEach((slot, index) => {
    if (!slot) return;
    const pickName = p2Picks[index];
    const isActive =
      currentPhase?.startsWith("PICK") &&
      currentTurn === "P2" &&
      !pickName &&
      index === p2Picks.length;

    if (pickName) {
      const resonator = findResonatorByName(pickName);
      if (resonator && resonator.image_pick) {
        slot.innerHTML = `<img src="${resonator.image_pick}" alt="${resonator.name}" title="${resonator.name}" style="width: 100%; height: 100%; object-fit: contain;">`;
      } else {
        slot.innerHTML = `<span>?</span>`;
      }
    } else {
      slot.innerHTML = "";
    }

    updateSlotGlowState(slot, isActive, !!pickName, "pick");
  });
}

// --- ADD NEW FUNCTION for Ban Slots ---
function updateBanSlots(draftState) {
  const bans = draftState.bans || [];
  const currentPhase = draftState.currentPhase;
  const currentTurn = draftState.currentTurn;

  const banSlotElements = elements.banSlots || [
    elements.banSlot1,
    elements.banSlot2,
    elements.banSlot3,
    elements.banSlot4,
  ];

  banSlotElements.forEach((slot, index) => {
    if (!slot) return;
    const banName = bans[index];
    const isActive =
      currentPhase?.startsWith("BAN") && !banName && index === bans.length;

    if (banName) {
      const resonator = findResonatorByName(banName);
      if (resonator && resonator.image_button) {
        slot.innerHTML = `<img src="${resonator.image_button}" alt="${banName}" title="${banName}" style="max-width: 90%; max-height: 90%; object-fit: cover; border-radius: 3px;">`;
      } else {
        slot.innerHTML = `<span>X</span>`;
      }
    } else {
      slot.innerHTML = "";
    }

    updateSlotGlowState(slot, isActive, !!banName, "ban");
  });
}

// --- ADD TIMER DISPLAY FUNCTIONS ---

export function stopTimerDisplay() {
  state.clearTimerInterval();
  if (elements.draftTimer) {
    const timerTextSpan = elements.draftTimer.querySelector("span");
    if (timerTextSpan) {
      timerTextSpan.textContent = "Time Remaining: --:--";
    }
    elements.draftTimer.classList.remove("timer-low");
  }
}

// This internal function updates the clock display
function updateCountdown(expiryTime, intervalId) {
  const {
    myAssignedSlot,
    currentTurn,
    currentPhase,
    timerIntervalId: activeTimerId,
  } = state;

  // Timer ID check (keep existing)
  if (intervalId !== activeTimerId) {
    clearInterval(intervalId);
    return;
  }

  const now = Date.now();
  const remainingMs = expiryTime - now;
  const timerElement = elements.draftTimer; // Get the <p> element
  const timerTextSpan = timerElement?.querySelector("span"); // Get the <span> inside

  if (!timerElement || !timerTextSpan) {
    console.warn("Timer element or text span not found in updateCountdown.");
    clearInterval(intervalId);
    state.clearTimerInterval(); // Clear state interval ID too
    return;
  }

  if (remainingMs <= 0) {
    timerTextSpan.textContent = "Time Remaining: 00:00";
    timerElement.classList.add("timer-low");

    clearInterval(intervalId);

    // Restore timeout action logic
    if (myAssignedSlot === currentTurn) {
      // Send timeout request immediately when timer reaches zero
      if (state.currentTurn === myAssignedSlot) {
        sendMessageToServer({
          action: "turnTimeout",
          expectedPhase: state.currentPhase,
          expectedTurn: myAssignedSlot,
        });
      }
    }
  } else {
    const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const displayString = `Time Remaining: ${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;

    timerTextSpan.textContent = displayString;

    // Low Time Check
    if (remainingSeconds <= 10) {
      timerElement.classList.add("timer-low");
    } else {
      timerElement.classList.remove("timer-low");
    }
  }
}

// This function starts a new timer cycle
export function startOrUpdateTimerDisplay() {
  // console.log("UI DEBUG: startOrUpdateTimerDisplay START.");
  stopTimerDisplay();

  // console.log(
  //   `UI DEBUG: Reading state.currentTurnExpiresAt: ${state.currentTurnExpiresAt}`
  // );

  if (!state.currentTurnExpiresAt) {
    // console.log("UI DEBUG: No expiry time set in state, timer not starting.");
    return;
  }

  try {
    const expiryTimestamp = new Date(state.currentTurnExpiresAt).getTime();
    // console.log(
    //   `UI DEBUG: Parsed expiryTimestamp: ${expiryTimestamp} (isNaN: ${isNaN(
    //     expiryTimestamp
    //   )})`
    // );

    if (isNaN(expiryTimestamp)) {
      console.error(
        "UI DEBUG: Invalid expiry timestamp received from state:",
        state.currentTurnExpiresAt
      );
      return;
    }

    const now = Date.now();
    // console.log(
    //   `UI DEBUG: Comparing expiry ${expiryTimestamp} with now ${now}`
    // );

    if (expiryTimestamp <= now) {
      // console.log(
      //   "UI DEBUG: Expiry time is in the past. Setting timer to 00:00."
      // );
      if (elements.draftTimer) {
        elements.draftTimer.textContent = "Time Remaining: 00:00";
        elements.draftTimer.classList.add("text-danger", "fw-bold");
      }
      return;
    }

    // console.log(`UI DEBUG: Starting new timer interval...`);

    const newIntervalId = setInterval(() => {
      updateCountdown(expiryTimestamp, newIntervalId);
    }, 1000);

    // console.log(
    //   `UI DEBUG: New interval created with ID: ${newIntervalId}. Storing in state via function.`
    // );
    state.setTimerIntervalId(newIntervalId);

    // console.log(
    //   `UI DEBUG: Calling updateCountdown immediately once for ID ${newIntervalId}.`
    // );
    updateCountdown(expiryTimestamp, newIntervalId);
  } catch (e) {
    console.error("UI DEBUG: Error during timer start:", e);
    stopTimerDisplay();
  }
}

// --- END TIMER DISPLAY FUNCTIONS ---

// --- MODIFY updateDraftScreenUI FUNCTION ---
export function updateDraftScreenUI(draftState) {
  // console.log("UI: Updating draft screen UI with state:", draftState);
  if (!elements || !elements.draftScreen) {
    // console.error(
    //   "UI Update Error: elements object or draftScreen element not initialized!"
    // );
    return;
  }

  // Show/hide controls based on host status
  const isHost = state.isCurrentUserHost;
  console.log(
    `[uiViews] updateDraftScreenUI: Setting visibility. isHost = ${isHost}`
  );

  // Show host controls ONLY if host
  toggleElementVisibility(elements.draftHostControls, isHost);
  // Show player controls ONLY if NOT host (i.e., is a player)
  toggleElementVisibility(elements.draftPlayerControls, !isHost);
  // Hide the back button if host
  toggleElementVisibility(elements.draftBackBtn, !isHost);

  // Keep controls visible even in draft complete state
  // (removed code that was hiding controls)

  // If draft is complete, return early
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
    }
    // Optionally hide filter controls
    const filterControls = document.getElementById("draft-filter-controls");
    if (filterControls) filterControls.style.display = "none";

    stopTimerDisplay(); // Explicitly stop timer on completion
    // Remove active turn class if draft completes
    const playerAreas = document.querySelectorAll(
      ".draft-main-flex-container .player-area"
    );
    playerAreas.forEach((area) => area.classList.remove("active-turn"));
    return;
  }

  // Update Phase and Turn Status & Apply Class
  if (elements.draftPhaseStatus) {
    // Reset phase styling classes first
    elements.draftPhaseStatus.classList.remove(
      "phase-ban",
      "phase-pick",
      "phase-complete",
      "text-success",
      "fw-bold"
    );

    const currentPhase = draftState.currentPhase || "N/A";
    const turnPlayerName =
      draftState.currentTurn === "P1"
        ? draftState.player1Name || "Player 1"
        : draftState.player2Name || "Player 2";
    const isMyTurnText =
      state.myAssignedSlot === draftState.currentTurn ? " (Your Turn)" : "";

    // Set text content
    if (currentPhase === "DRAFT_COMPLETE") {
      elements.draftPhaseStatus.textContent = "Draft Complete!";
      elements.draftPhaseStatus.classList.add("phase-complete");
    } else {
      elements.draftPhaseStatus.textContent = `Phase: ${currentPhase} | ${turnPlayerName}'s Turn${isMyTurnText}`;

      // Add class based on current phase
      if (currentPhase.startsWith("BAN")) {
        elements.draftPhaseStatus.classList.add("phase-ban");
      } else if (currentPhase.startsWith("PICK")) {
        elements.draftPhaseStatus.classList.add("phase-pick");
      }
    }
  } else {
    console.warn("UI Update Warning: Draft phase status element not found");
  }

  // Update Player Names
  if (elements.draftP1Name) {
    elements.draftP1Name.textContent = draftState.player1Name || "[P1 Name]";
  }
  if (elements.draftP2Name) {
    elements.draftP2Name.textContent = draftState.player2Name || "[P2 Name]";
  }

  // Update Pick and Ban Slots
  updatePickSlots(draftState);
  updateBanSlots(draftState);

  // Render Character Grid
  try {
    renderCharacterGrid(draftState);
  } catch (gridError) {
    console.error("Error calling renderCharacterGrid:", gridError);
  }

  // Update Active Turn Class
  try {
    const mainContainer = document.querySelector(".draft-main-flex-container");
    const p1Area = mainContainer?.querySelector(".player-area:first-of-type");
    const p2Area = mainContainer?.querySelector(".player-area:last-of-type");

    if (p1Area && p2Area) {
      // Remove class from both first
      p1Area.classList.remove("active-turn");
      p2Area.classList.remove("active-turn");

      // Add class to the active player's area
      if (draftState.currentTurn === "P1") {
        p1Area.classList.add("active-turn");
      } else if (draftState.currentTurn === "P2") {
        p2Area.classList.add("active-turn");
      }
    } else {
      console.warn("Could not find player areas to update active turn status.");
    }
  } catch (e) {
    console.error("Error updating active turn UI:", e);
  }

  // Start/Update Timer
  startOrUpdateTimerDisplay();
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
  // console.log(`UI: Applying filter: ${filterElement}`);
  state.setActiveElementFilter(filterElement);

  if (state.currentDraftState) {
    renderCharacterGrid(state.currentDraftState);
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

  const activeFilter = state.activeElementFilter || "All";
  // console.log(`UI: Rendering grid with filter: ${activeFilter}`);

  // console.log(
  //   "UI: Rendering character grid. Raw draftState:",
  //   draftState
  // );
  elements.characterGridContainer.innerHTML = "";

  const availableResonators = draftState.availableResonators || [];
  const player1Picks = draftState.player1Picks || [];
  const player2Picks = draftState.player2Picks || [];
  const bans = draftState.bans || [];
  const currentTurn = draftState.currentTurn || state.currentTurn;

  const isMyTurn = state.myAssignedSlot === currentTurn;
  // console.log(
  //   `UI: Rendering grid. Is it my turn? ${isMyTurn} (MySlot: ${state.myAssignedSlot}, CurrentTurn: ${currentTurn})`
  // );

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
    button.classList.add("character-button", "stylish-button");
    button.dataset.resonatorId = resonator.id;
    button.dataset.resonatorName = resonator.name;

    // Add rarity class
    if (resonator.rarity === 5) {
      button.classList.add("rarity-5");
    } else if (resonator.rarity === 4) {
      button.classList.add("rarity-4");
    }

    const imgSrc = resonator.image_button || ""; // Use button image, provide fallback

    // Create structure with image and name span
    button.innerHTML = `
        <img src="${imgSrc}" alt="${resonator.name}" title="${resonator.name}" class="character-icon" onerror="this.style.display='none'; this.parentElement.textContent='?';" />
        <span class="character-name">${resonator.name}</span>
    `;

    // Determine button state based on draftState
    let isAvailable = availableSet.has(resonator.name);
    let isPickedByP1 = p1PicksSet.has(resonator.name);
    let isPickedByP2 = p2PicksSet.has(resonator.name);
    let isBanned = bansSet.has(resonator.name);
    let isUnavailable = isPickedByP1 || isPickedByP2 || isBanned;

    // --- ADD DEBUG LOG ---
    if (resonator.name === "Yuanwu") {
      // Or the name you are testing with
      // console.log(
      //   `DEBUG (${resonator.name}): isBanned=${isBanned}, isPickedP1=${isPickedByP1}, isPickedP2=${isPickedByP2}, isAvailable=${isAvailable}, availableSet:`,
      //   availableSet,
      //   "bansSet:",
      //   bansSet
      // );
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
  });
}

export function handleCharacterSelection(event) {
  const button = event.currentTarget;
  const resonatorName = button.dataset.resonatorName;

  if (!resonatorName) {
    console.error(
      "Character button clicked, but missing resonator name dataset!"
    );
    return;
  }

  button.disabled = true;
  button.classList.add("just-selected");

  let action = null;
  const phase = state.currentPhase;

  if (phase?.startsWith("BAN")) {
    action = "makeBan";
  } else if (phase?.startsWith("PICK")) {
    action = "makePick";
  } else {
    console.error(`Unknown phase (${phase}) - cannot determine action.`);
    button.disabled = false;
    button.classList.remove("just-selected");
    return;
  }

  const message = {
    action: action,
    resonatorName: resonatorName,
  };
  sendMessageToServer(message);

  // Disable all character buttons pending state update
  const allCharacterButtons =
    elements.characterGridContainer?.querySelectorAll(".character-button");
  if (allCharacterButtons) {
    allCharacterButtons.forEach((btn) => {
      btn.disabled = true;
    });
  }
}

// --- NEW FUNCTION: updateTotalBoxScore ---
export function updateTotalBoxScore() {
  if (
    !elements.limitedResonatorsList ||
    !elements.totalBoxScoreDisplay ||
    !SEQUENCE_POINTS
  ) {
    return;
  }

  let totalScore = 0;
  const selects =
    elements.limitedResonatorsList.querySelectorAll(".sequence-select");

  selects.forEach((select) => {
    const sequenceValue = parseInt(select.value, 10);
    let charPoints = 0;

    if (sequenceValue >= 0 && sequenceValue <= 6) {
      charPoints = SEQUENCE_POINTS[sequenceValue] || 0;
    }

    const pointsDisplayElement = select
      .closest(".row")
      ?.querySelector(".resonator-points-display");
    if (pointsDisplayElement) {
      pointsDisplayElement.innerHTML = `<small>Points: ${charPoints}</small>`;
    }

    totalScore += charPoints;
  });

  elements.totalBoxScoreDisplay.textContent = totalScore;
}

// --- NEW FUNCTION: populateBoxScoreScreen ---
export function populateBoxScoreScreen() {
  if (
    !elements.limitedResonatorsList ||
    !ALL_RESONATORS_DATA ||
    !SEQUENCE_POINTS
  ) {
    console.error(
      "Cannot populate box score screen, critical elements or data missing."
    );
    return;
  }

  elements.limitedResonatorsList.innerHTML = ""; // Clear previous entries
  const limitedResonators = ALL_RESONATORS_DATA.filter(
    (resonator) => resonator.isLimited === true
  );

  if (limitedResonators.length === 0) {
    elements.limitedResonatorsList.innerHTML =
      '<p class="text-muted">No limited resonators found in data to declare sequences for.</p>';
    updateTotalBoxScore();
    return;
  }

  limitedResonators.forEach((resonator) => {
    const resonatorRow = document.createElement("div");
    resonatorRow.className =
      "row mb-3 align-items-center justify-content-center border-bottom pb-2";

    const nameLabel = document.createElement("label");
    nameLabel.className = "col-md-4 col-form-label text-md-end fw-bold";
    nameLabel.textContent = `${resonator.name}:`;

    const selectDiv = document.createElement("div");
    selectDiv.className = "col-md-3";
    const selectElement = document.createElement("select");
    selectElement.className = "form-select sequence-select text-center";
    selectElement.dataset.resonatorName = resonator.name;

    // Add "Not Owned" option
    const notOwnedOption = document.createElement("option");
    notOwnedOption.value = "-1";
    notOwnedOption.textContent = "Not Owned";
    selectElement.appendChild(notOwnedOption);

    // Add S0-S6 options
    for (let i = 0; i <= 6; i++) {
      const option = document.createElement("option");
      option.value = i.toString();
      option.textContent = `S${i}`;
      selectElement.appendChild(option);
    }
    selectElement.value = "-1"; // Default to "Not Owned"

    selectElement.addEventListener("change", updateTotalBoxScore);
    selectDiv.appendChild(selectElement);

    const pointsDisplay = document.createElement("div");
    pointsDisplay.className = "col-md-3 resonator-points-display text-md-start";
    pointsDisplay.innerHTML = "<small>Points: 0</small>";

    resonatorRow.appendChild(nameLabel);
    resonatorRow.appendChild(selectDiv);
    resonatorRow.appendChild(pointsDisplay);

    elements.limitedResonatorsList.appendChild(resonatorRow);
  });

  updateTotalBoxScore();
}
