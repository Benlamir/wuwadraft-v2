// frontend/js/uiViews.js
import { elements } from "./uiElements.js";
import { EQUILIBRATION_PHASE_NAME } from "./config.js";
import * as state from "./state.js"; // Use state variables
import { sendMessageToServer } from "./websocket.js"; // Import function to send messages
import { ALL_RESONATORS_DATA, SEQUENCE_POINTS } from "./resonatorData.js";
import { LOCAL_STORAGE_SEQUENCES_KEY } from "./config.js";

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
      if (!state.hasPopulatedBoxScoreScreenThisTurn) {
        // Check the flag
        populateBoxScoreScreen();
        state.setHasPopulatedBoxScoreScreenThisTurn(true); // Set flag after populating
      }
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
      // If we are navigating AWAY from box-score-screen for any reason,
      // reset the flag so it populates fresh next time.
      const currentActiveScreen = document.querySelector(".screen.active");
      if (
        currentActiveScreen &&
        currentActiveScreen.id === "box-score-screen"
      ) {
        state.setHasPopulatedBoxScoreScreenThisTurn(false);
      }

      // Ensure host's leave slot button (specific to BSS) is hidden if not on box score screen
      if (elements.boxScoreLeaveSlotBtn) {
        toggleElementVisibility(elements.boxScoreLeaveSlotBtn, false);
      }
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

  // Extract scores and submission statuses
  const p1Score = lobbyStateData.player1WeightedBoxScore;
  const p1Submitted = lobbyStateData.player1ScoreSubmitted;
  const p2Score = lobbyStateData.player2WeightedBoxScore;
  const p2Submitted = lobbyStateData.player2ScoreSubmitted;

  console.log(
    `UI_VIEWS_DEBUG: p1Score extracted as: ${p1Score}, p1Submitted: ${p1Submitted}`
  );

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

  // Update Player 1 Score Display
  if (elements.player1ScoreDisplay) {
    if (p1Submitted) {
      elements.player1ScoreDisplay.textContent = `(Score: ${
        p1Score !== null ? p1Score : "N/A"
      })`;
      elements.player1ScoreDisplay.classList.add("text-info");
    } else if (
      state.equilibrationEnabledForLobby &&
      lobbyStateData.player1Name
    ) {
      elements.player1ScoreDisplay.textContent = "(Score Pending)";
      elements.player1ScoreDisplay.classList.remove("text-info");
    } else {
      elements.player1ScoreDisplay.textContent = "";
      elements.player1ScoreDisplay.classList.remove("text-info");
    }
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

  // Update Player 2 Score Display
  if (elements.player2ScoreDisplay) {
    if (p2Submitted) {
      elements.player2ScoreDisplay.textContent = `(Score: ${
        p2Score !== null ? p2Score : "N/A"
      })`;
      elements.player2ScoreDisplay.classList.add("text-info");
    } else if (
      state.equilibrationEnabledForLobby &&
      lobbyStateData.player2Name
    ) {
      elements.player2ScoreDisplay.textContent = "(Score Pending)";
      elements.player2ScoreDisplay.classList.remove("text-info");
    } else {
      elements.player2ScoreDisplay.textContent = "";
      elements.player2ScoreDisplay.classList.remove("text-info");
    }
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
        //console.log("Applying lobby-status-info class"); // Debug log
      } else {
        // Default case for other lastAction messages (uses default text color)
        //console.log(
        //  "Applying default style for lastAction:",
        //  lobbyStateData.lastAction
        //);
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
  //console.log(
  //  "UPDATE_PICK_SLOTS: Called. draftState.player1Picks:",
  //  JSON.stringify(draftState.player1Picks),
  //  "draftState.player2Picks:",
  //  JSON.stringify(draftState.player2Picks)
  //);
  const p1Picks = draftState.player1Picks || [];
  const p2Picks = draftState.player2Picks || [];
  //console.log(
  //  "UPDATE_PICK_SLOTS: Parsed p1Picks for slots:",
  //  JSON.stringify(p1Picks)
  //);
  //console.log(
  //  "UPDATE_PICK_SLOTS: Parsed p2Picks for slots:",
  //  JSON.stringify(p2Picks)
  //);

  const currentPhase = draftState.currentPhase;
  const currentTurn = draftState.currentTurn;

  const p1SlotElements = [elements.p1Pick1, elements.p1Pick2, elements.p1Pick3];
  //console.log(
  //  "UPDATE_PICK_SLOTS: P1 Slot Elements:",
  //  p1SlotElements.map((el) => !!el)
  //); // Check if elements are found

  p1SlotElements.forEach((slot, index) => {
    if (!slot) {
      console.error(
        `UPDATE_PICK_SLOTS_ERROR: P1 pick slot element at index ${index} not found!`
      );
      return;
    }
    const pickName = p1Picks[index];
    const isActive =
      currentPhase?.startsWith("PICK") &&
      currentTurn === "P1" &&
      !pickName &&
      index === p1Picks.length;
    //console.log(
    //  `UPDATE_PICK_SLOTS: P1 Slot ${
    //    index + 1
    //  }, pickName: ${pickName}, isActive: ${isActive}`
    //);
    if (pickName) {
      const resonator = findResonatorByName(pickName);
      //console.log(
      //  `UPDATE_PICK_SLOTS: P1 Slot ${
      //    index + 1
      //  } findResonatorByName('${pickName}') result:`,
      //  resonator
      //);
      if (resonator && resonator.image_pick) {
        slot.innerHTML = `<img src="${resonator.image_pick}" alt="${resonator.name}" title="${resonator.name}" style="width: 100%; height: 100%; object-fit: contain;">`;
        //console.log(
        // `UPDATE_PICK_SLOTS: P1 Slot ${
        //   index + 1
        //  } updated with image for ${pickName}. InnerHTML set.`
        //);
      } else {
        slot.innerHTML = `<span>${pickName || "?"}</span>`;
        //console.log(
        //  `UPDATE_PICK_SLOTS: P1 Slot ${
        //    index + 1
        //  } set with text for ${pickName} (resonator or image_pick missing).`
        //);
      }
    } else {
      slot.innerHTML = "";
      //onsole.log(`UPDATE_PICK_SLOTS: Clearing P1 Slot ${index + 1}`);
    }
    updateSlotGlowState(slot, isActive, !!pickName, "pick");
  });

  const p2SlotElements = [elements.p2Pick1, elements.p2Pick2, elements.p2Pick3];
  //console.log(
    //"UPDATE_PICK_SLOTS: P2 Slot Elements:",
  //  p2SlotElements.map((el) => !!el)
  //);

  p2SlotElements.forEach((slot, index) => {
    if (!slot) {
      console.error(
        `UPDATE_PICK_SLOTS_ERROR: P2 pick slot element at index ${index} not found!`
      );
      return;
    }
    const pickName = p2Picks[index];
    const isActive =
      currentPhase?.startsWith("PICK") &&
      currentTurn === "P2" &&
      !pickName &&
      index === p2Picks.length;
    //console.log(
    //  `UPDATE_PICK_SLOTS: P2 Slot ${
    //    index + 1
    //  }, pickName: ${pickName}, isActive: ${isActive}`
    //);
    if (pickName) {
      const resonator = findResonatorByName(pickName);
      //console.log(
      //  `UPDATE_PICK_SLOTS: P2 Slot ${
      //    index + 1
      //  } findResonatorByName('${pickName}') result:`,
      //  resonator
      //);
      if (resonator && resonator.image_pick) {
        slot.innerHTML = `<img src="${resonator.image_pick}" alt="${resonator.name}" title="${resonator.name}" style="width: 100%; height: 100%; object-fit: contain;">`;
        //console.log(
        //  `UPDATE_PICK_SLOTS: P2 Slot ${
        //    index + 1
        //  } updated with image for ${pickName}. InnerHTML set.`
        //);
      } else {
        slot.innerHTML = `<span>${pickName || "?"}</span>`;
        //console.log(
        //  `UPDATE_PICK_SLOTS: P2 Slot ${
        //    index + 1
        //  } set with text for ${pickName} (resonator or image_pick missing).`
        //);
      }
    } else {
      slot.innerHTML = "";
      //console.log(`UPDATE_PICK_SLOTS: Clearing P2 Slot ${index + 1}`);
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
  // console.log("UI_VIEWS_TIMER: stopTimerDisplay called.");
  state.clearTimerInterval(); // Clears intervalId in state.js AND calls clearInterval

  const timerElement = elements.draftTimer;
  // Only try to update DOM if the timer element is actually part of the current document
  if (timerElement && document.body.contains(timerElement)) {
    const timerTextSpan = timerElement.querySelector("span");
    if (timerTextSpan) {
      timerTextSpan.textContent = "Time Remaining: --:--";
    } else {
      // This warning is acceptable if the span was, e.g., cleared by other DOM manipulation
      // console.warn("UI_VIEWS_TIMER: stopTimerDisplay - timerTextSpan not found within existing timerElement.");
    }
    timerElement.classList.remove("timer-low");
  } else {
    // console.warn("UI_VIEWS_TIMER: stopTimerDisplay - elements.draftTimer not found or not in DOM.");
  }
}

// This internal function updates the clock display
function updateCountdown(expiryTime, intervalId) {
  // Check if this interval should still be running
  if (state.timerIntervalId === null || intervalId !== state.timerIntervalId) {
    // console.log(`UI_VIEWS_TIMER: updateCountdown (interval ${intervalId}) - Mismatch or timer already cleared by state (${state.timerIntervalId}). Clearing this interval.`);
    clearInterval(intervalId);
    return;
  }

  const timerElement = elements.draftTimer;
  if (!timerElement || !document.body.contains(timerElement)) {
    console.warn(
      "UI_VIEWS_TIMER: updateCountdown - elements.draftTimer NOT FOUND or not in DOM. Clearing interval.",
      intervalId
    );
    clearInterval(intervalId);
    state.clearTimerInterval(); // Ensure state reflects this cleanup
    return;
  }
  const timerTextSpan = timerElement.querySelector("span");
  if (!timerTextSpan) {
    console.warn(
      "UI_VIEWS_TIMER: updateCountdown - timerTextSpan NOT FOUND. Clearing interval.",
      intervalId
    );
    clearInterval(intervalId);
    state.clearTimerInterval();
    return;
  }

  const now = Date.now();
  const remainingMs = expiryTime - now;

  if (remainingMs <= 0) {
    timerTextSpan.textContent = "Time Remaining: 00:00";
    timerElement.classList.add("timer-low");
    clearInterval(intervalId); // Stop this interval

    // Only allow the client whose turn it was to send the timeout action
    if (
      state.myAssignedSlot === state.currentTurn &&
      state.timerIntervalId === intervalId
    ) {
      //console.log(
      //  "UI_VIEWS_TIMER: Timer expired for my turn. Sending turnTimeout action."
      //);
      sendMessageToServer({
        action: "turnTimeout",
        expectedPhase: state.currentPhase,
        expectedTurn: state.myAssignedSlot,
      });
    }
    state.clearTimerInterval(); // Clear from state AFTER sending timeout
  } else {
    const remainingSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    timerTextSpan.textContent = `Time Remaining: ${String(minutes).padStart(
      2,
      "0"
    )}:${String(seconds).padStart(2, "0")}`;

    if (remainingSeconds <= 10) {
      timerElement.classList.add("timer-low");
    } else {
      timerElement.classList.remove("timer-low");
    }
  }
}

// This function starts a new timer cycle
export function startOrUpdateTimerDisplay() {
  // console.log("UI_VIEWS_TIMER: startOrUpdateTimerDisplay called. currentTurnExpiresAt:", state.currentTurnExpiresAt);
  stopTimerDisplay(); // Clear any previous timer first

  if (!state.currentTurnExpiresAt) {
    // console.log("UI_VIEWS_TIMER: No currentTurnExpiresAt in state. Timer will not start.");
    return;
  }

  const timerElement = elements.draftTimer;
  // Ensure the timer element exists and has its necessary child span before starting.
  // This is important if the draft screen was just made active.
  if (!timerElement || !document.body.contains(timerElement)) {
    console.warn(
      "UI_VIEWS_TIMER: startOrUpdateTimerDisplay - elements.draftTimer NOT FOUND or not in DOM. Timer not starting."
    );
    return;
  }
  // Ensure the inner structure (span) is present
  if (!timerElement.querySelector("span")) {
    //console.log(
    //  "UI_VIEWS_TIMER: startOrUpdateTimerDisplay - timerTextSpan missing. Re-initializing timer HTML."
    //);
    timerElement.innerHTML =
      '<i class="bi bi-clock timer-icon me-1"></i> <span>Time Remaining: --:--</span>';
  }

  try {
    const expiryTimestamp = new Date(state.currentTurnExpiresAt).getTime();
    if (isNaN(expiryTimestamp)) {
      console.error(
        "UI_VIEWS_TIMER: Invalid expiry timestamp:",
        state.currentTurnExpiresAt
      );
      return;
    }

    const now = Date.now();
    if (expiryTimestamp <= now) {
      // console.log("UI_VIEWS_TIMER: Expiry time is in the past. Setting timer display to 00:00.");
      const timerTextSpan = timerElement.querySelector("span");
      if (timerTextSpan) {
        // Check again as it might have been just added
        timerTextSpan.textContent = "Time Remaining: 00:00";
      }
      timerElement.classList.add("timer-low");
      return;
    }

    const newIntervalId = setInterval(() => {
      updateCountdown(expiryTimestamp, newIntervalId);
    }, 1000);
    state.setTimerIntervalId(newIntervalId); // Store the new interval ID in state
    // console.log(`UI_VIEWS_TIMER: New timer interval started with ID: ${newIntervalId}. Expiry: ${state.currentTurnExpiresAt}`);

    // Call updateCountdown once immediately using a slight delay to ensure DOM is fully ready
    setTimeout(() => {
      if (state.timerIntervalId === newIntervalId) {
        // Check if this timer is still the active one
        updateCountdown(expiryTimestamp, newIntervalId);
      }
    }, 0); // A 0ms timeout defers execution until after current call stack clears
  } catch (e) {
    console.error(
      "UI_VIEWS_TIMER: Error during timer start in startOrUpdateTimerDisplay:",
      e
    );
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
  //console.log(
  //  `[uiViews] updateDraftScreenUI: Setting visibility. isHost = ${isHost}`
  //);

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
    //console.log("UI: Rendering Draft Complete state.");
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
    elements.draftP1Name.textContent = `P1: ${draftState.player1Name}`;
  }
  if (elements.draftP2Name) {
    elements.draftP2Name.textContent = `P2: ${draftState.player2Name}`;
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
    //console.log("UI: Password toggle listener attached.");
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
    //console.log("UI: Lobby ID display toggle listener attached.");
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
    //console.log("UI: Copy button listener attached.");
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
  console.log(
    "RENDER_GRID_ENTRY: Received draftState:",
    JSON.parse(JSON.stringify(draftState))
  ); // Log a deep copy
  console.log(
    "RENDER_GRID_DATA_CHECK: draftState.equilibrationEnabled:",
    draftState.equilibrationEnabled
  );
  console.log(
    "RENDER_GRID_DATA_CHECK: draftState.player1Sequences:",
    JSON.stringify(draftState.player1Sequences)
  );
  console.log(
    "RENDER_GRID_DATA_CHECK: draftState.player2Sequences:",
    JSON.stringify(draftState.player2Sequences)
  );

  // Log 1: Function entry and basic draftState info
  //console.log(
  //  "RENDER_GRID: Entry. Current Phase:",
  //  draftState.currentPhase,
  //  "Current Turn:",
  //  draftState.currentTurn
  //);

  // Add logs BSS related data from draftstate
  //console.log(
  //  "RENDER_GRID: Equilibration Enabled in draftState:",
  //  draftState.equilibrationEnabled
  //);
  // Check if sequences are objects, otherwise default to empty object for safety
  const p1SequencesFromState =
    typeof draftState.player1Sequences === "object" &&
    draftState.player1Sequences !== null
      ? draftState.player1Sequences
      : {};
  const p2SequencesFromState =
    typeof draftState.player2Sequences === "object" &&
    draftState.player2Sequences !== null
      ? draftState.player2Sequences
      : {};
  //console.log(
  //  "RENDER_GRID: P1 Sequences in draftState:",
  //  JSON.stringify(p1SequencesFromState)
  //);
  //console.log(
  //  "RENDER_GRID: P2 Sequences in draftState:",
  //  JSON.stringify(p2SequencesFromState)
  //);

  if (!elements.characterGridContainer) {
    console.error(
      "RENDER_GRID_ERROR: elements.characterGridContainer is null or undefined!"
    );
    return;
  }

  // Log 5: Active filter
  const activeFilter = state.activeElementFilter || "All";
  elements.characterGridContainer.innerHTML = "";

  // Log 3: Available Resonators from draftState
  const availableResonatorsFromServer = draftState.availableResonators || [];

  if (
    availableResonatorsFromServer.length === 0 &&
    draftState.currentPhase !== DRAFT_COMPLETE_PHASE
  ) {
    console.warn(
      "RENDER_GRID_WARN: No availableResonators from server, but draft is not complete. Grid will be empty."
    );
  }
  // Log 4: Player picks and bans from draftState
  const player1Picks = draftState.player1Picks || [];
  const player2Picks = draftState.player2Picks || [];
  const bans = draftState.bans || [];
  //onsole.log("RENDER_GRID: P1 Picks:", JSON.stringify(player1Picks));
  //console.log("RENDER_GRID: P2 Picks:", JSON.stringify(player2Picks));
  //console.log("RENDER_GRID: Bans:", JSON.stringify(bans));
  const currentTurn = draftState.currentTurn || state.currentTurn;

  const isMyTurn = state.myAssignedSlot === currentTurn;
  // console.log(
  //   `UI: Rendering grid. Is it my turn? ${isMyTurn} (MySlot: ${state.myAssignedSlot}, CurrentTurn: ${currentTurn})`
  // );

  const availableSet = new Set(availableResonatorsFromServer);
  const p1PicksSet = new Set(player1Picks);
  const p2PicksSet = new Set(player2Picks);
  const bansSet = new Set(bans);

  // Filter ALL_RESONATORS_DATA based on the activeFilter
  const resonatorsToDisplay =
    activeFilter === "All"
      ? ALL_RESONATORS_DATA // Use the full list from resonatorData.js
      : ALL_RESONATORS_DATA.filter(
          (resonator) =>
            Array.isArray(resonator.element) &&
            resonator.element.includes(activeFilter)
        );

  // Log 6: Resonators to display after filtering ALL_RESONATORS_DATA
  //console.log(
  //  "RENDER_GRID: resonatorsToDisplay after client-side filter (length):",
  //  resonatorsToDisplay.length
  //);

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

    // --- NEW: Add Sequence Overlay Logic ---
    if (draftState.equilibrationEnabled && resonator.isLimited) {
      // p1SequencesFromState and p2SequencesFromState are already safely defaulted to {} if null/undefined
      const p1SeqVal = p1SequencesFromState[resonator.name];
      const p2SeqVal = p2SequencesFromState[resonator.name];

      // Only create container if there's at least one sequence to show
      let hasSequenceInfo = false;
      const sequenceTexts = [];

      if (p1SeqVal !== undefined && p1SeqVal >= -1) {
        // Allow "Not Owned" (-1) or S0-S6
        sequenceTexts.push(
          `<span class="sequence-display p1-sequence">P1: ${
            p1SeqVal === -1 ? "N/A" : "S" + p1SeqVal
          }</span>`
        );
        hasSequenceInfo = true;
      }
      if (p2SeqVal !== undefined && p2SeqVal >= -1) {
        sequenceTexts.push(
          `<span class="sequence-display p2-sequence">P2: ${
            p2SeqVal === -1 ? "N/A" : "S" + p2SeqVal
          }</span>`
        );
        hasSequenceInfo = true;
      }

      if (hasSequenceInfo) {
        const sequenceOverlayContainer = document.createElement("div");
        sequenceOverlayContainer.className = "sequence-overlay-container";
        sequenceOverlayContainer.innerHTML = sequenceTexts.join(""); // Add all sequence texts
        button.appendChild(sequenceOverlayContainer);
      }
    }
    // --- END NEW ---

    // Determine button state based on draftState
    let isActuallyAvailableOnServer = availableSet.has(resonator.name);
    let isPickedByP1 = p1PicksSet.has(resonator.name);
    let isPickedByP2 = p2PicksSet.has(resonator.name);
    let isBanned = bansSet.has(resonator.name);

    // A character is truly unavailable for selection if picked, banned, OR NOT in the server's available list.
    let isUnavailableForSelection =
      isPickedByP1 || isPickedByP2 || isBanned || !isActuallyAvailableOnServer;

    // Log 7: Determine whose turn it is (for clickability)
    let isMyTurnContext = false;
    if (draftState.currentPhase === state.EQUILIBRATION_PHASE_NAME) {
      isMyTurnContext =
        state.myAssignedSlot === draftState.currentEquilibrationBanner;
    } else {
      isMyTurnContext = state.myAssignedSlot === draftState.currentTurn;
    }

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
    } else if (isActuallyAvailableOnServer) {
      button.classList.add("available");
    } else {
      // If not available, and not picked/banned (shouldn't happen with correct availableResonators list)
      button.classList.add("unavailable");
    }

    // Determine if this specific button should be clickable
    // Condition: Is it my turn? AND Is the character available? AND Not already picked/banned?
    const isClickable =
      isMyTurn && isActuallyAvailableOnServer && !isUnavailableForSelection;

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

    try {
      elements.characterGridContainer.appendChild(button);
    } catch (e) {
      console.error(
        `RENDER_GRID_ERROR: Failed to append button for ${resonator.name}:`,
        e
      );
    }
  });
}

export function handleCharacterSelection(event) {
  const button = event.currentTarget;
  const resonatorName = button.dataset.resonatorName;
  const localCurrentPhase = state.currentPhase; // Read from state.js
  const localCurrentTurn = state.currentTurn; // Read from state.js
  //console.log(
  //  `HANDLE_SELECTION_DEBUG: Clicked ${resonatorName}. state.currentPhase=${localCurrentPhase}, state.currentTurn=${localCurrentTurn}, state.myAssignedSlot=${state.myAssignedSlot}`
  //);

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
  //console.log(`HANDLE_SELECTION_DEBUG: state.currentPhase is: ${phase}`); // Debug log for phase

  if (phase?.startsWith("BAN") || phase === EQUILIBRATION_PHASE_NAME) {
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
  if (!elements.limitedResonatorsList || !ALL_RESONATORS_DATA) {
    console.error(
      "UI_VIEWS_BSS_ERROR: Cannot populate - critical elements/data missing."
    );
    return;
  }

  // ---- LOAD FROM LOCALSTORAGE ----
  let lastSubmittedSequences = {};
  try {
    const savedData = localStorage.getItem(LOCAL_STORAGE_SEQUENCES_KEY);
    //console.log(
    //  "POPULATE_BSS_DEBUG: Raw savedData from localStorage:",
    //  savedData
    //);
    if (savedData) {
      lastSubmittedSequences = JSON.parse(savedData);
      //console.log(
      //  "POPULATE_BSS_DEBUG: Parsed lastSubmittedSequences:",
      //  lastSubmittedSequences
      //);
    } else {
      //console.log("POPULATE_BSS_DEBUG: No savedData found in localStorage.");
    }
  } catch (e) {
    console.warn(
      "POPULATE_BSS_WARN: Could not parse sequences from localStorage.",
      e
    );
    lastSubmittedSequences = {}; // Default to empty if error
  }
  // -----------------------------

  elements.limitedResonatorsList.innerHTML = "";
  const limitedResonators = ALL_RESONATORS_DATA.filter(
    (resonator) => resonator.isLimited === true
  );

  if (limitedResonators.length === 0) {
    elements.limitedResonatorsList.innerHTML =
      '<p class="text-muted">No limited resonators found to declare sequences for.</p>';
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

    const notOwnedOption = document.createElement("option");
    notOwnedOption.value = "-1";
    notOwnedOption.textContent = "Not Owned";
    selectElement.appendChild(notOwnedOption);

    for (let i = 0; i <= 6; i++) {
      const option = document.createElement("option");
      option.value = i.toString();
      option.textContent = `S${i}`;
      selectElement.appendChild(option);
    }

    // ---- PRE-FILL LOGIC ----
    const previouslySelectedValue = lastSubmittedSequences[resonator.name];
    // console.log(`POPULATE_BSS_LOOP_DEBUG: For ${resonator.name}, previouslySelectedValue is: ${previouslySelectedValue}`);
    if (
      previouslySelectedValue !== undefined &&
      parseInt(previouslySelectedValue) >= -1 && // Allow -1 for "Not Owned"
      parseInt(previouslySelectedValue) <= 6
    ) {
      selectElement.value = previouslySelectedValue.toString();
    } else {
      selectElement.value = "-1"; // Default to "Not Owned"
    }
    // -------------------------

    selectElement.addEventListener("change", updateTotalBoxScore);
    selectDiv.appendChild(selectElement);

    const pointsDisplay = document.createElement("div");
    pointsDisplay.className = "col-md-3 resonator-points-display text-md-start";
    // updateTotalBoxScore will populate this after all elements are set
    pointsDisplay.innerHTML = "<small>Points: 0</small>";

    resonatorRow.appendChild(nameLabel);
    resonatorRow.appendChild(selectDiv);
    resonatorRow.appendChild(pointsDisplay);

    elements.limitedResonatorsList.appendChild(resonatorRow);
  });

  updateTotalBoxScore(); // Calculate initial total score based on pre-filled/default values

  // Ensure submit button is enabled when screen is populated
  if (elements.submitBoxScoreBtn) {
    elements.submitBoxScoreBtn.disabled = false;
    elements.submitBoxScoreBtn.innerHTML =
      '<i class="bi bi-check-circle-fill me-2"></i>Submit Score & Proceed';
  }
  //console.log(
  //  "UI_VIEWS_BSS: Box Score Screen populated. Submit button ensured enabled."
  //);
}
