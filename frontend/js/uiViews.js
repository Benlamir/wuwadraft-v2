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
      } else if (actionText.includes("joined as player")) {
        // Apply the blue info class for the host joining
        elements.lobbyStatusDisplay.classList.add("lobby-status-info");
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
    }
  }

  // --- Update Button Visibility using d-none class ---
  const isHost = state.isCurrentUserHost;
  const mySlot = state.myAssignedSlot;

  // Player Ready Buttons
  if (elements.player1ReadyBtn) {
    const playerIsActuallyReady = lobbyStateData.player1Ready === true;
    // Determine if the P1 Ready button *should* be shown
    const shouldShowP1ReadyButton =
      state.myAssignedSlot === "P1" && !playerIsActuallyReady;

    toggleElementVisibility(elements.player1ReadyBtn, shouldShowP1ReadyButton);
    elements.player1ReadyBtn.disabled = !shouldShowP1ReadyButton;
  }

  if (elements.player2ReadyBtn) {
    const playerIsActuallyReady = lobbyStateData.player2Ready === true;
    // Determine if the P2 Ready button *should* be shown
    const shouldShowP2ReadyButton =
      state.myAssignedSlot === "P2" && !playerIsActuallyReady;

    toggleElementVisibility(elements.player2ReadyBtn, shouldShowP2ReadyButton);
    elements.player2ReadyBtn.disabled = !shouldShowP2ReadyButton;
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

// Function to calculate draft sequence numbers for picks and bans
function calculateDraftSequence(draftState) {
  const effectiveDraftOrder = draftState.effectiveDraftOrder || [];
  const isEqEnabled = draftState.equilibrationEnabled;
  const eqBansAllowed = isEqEnabled
    ? draftState.equilibrationBansAllowed || 0
    : 0;
  const playerRoles = draftState.playerRoles || {};

  const sequence = {
    eqBans: {}, // { playerSlot: [orderNumbers] }
    picks: { P1: [], P2: [] }, // { P1: [orderNumbers], P2: [orderNumbers] }
    bans: { P1: [], P2: [] }, // { P1: [orderNumbers], P2: [orderNumbers] }
  };

  let currentOrderNumber = 1;

  // 1. Handle EQ bans first (if enabled)
  if (isEqEnabled && eqBansAllowed > 0) {
    const eqBanner = draftState.currentEquilibrationBanner;
    if (eqBanner) {
      sequence.eqBans[eqBanner] = [];
      for (let i = 0; i < eqBansAllowed; i++) {
        sequence.eqBans[eqBanner].push(currentOrderNumber++);
      }
    }
  }

  // 2. Handle standard draft order (picks and bans)
  effectiveDraftOrder.forEach((step) => {
    const roleDesignation = step.turnPlayerDesignation;
    let assignedPlayer = "P1"; // fallback

    // Resolve role to actual player using playerRoles mapping
    if (Object.keys(playerRoles).length > 0) {
      if (roleDesignation === "P1_ROLE") {
        assignedPlayer = playerRoles["P1_ROLE_IN_TEMPLATE"];
      } else if (roleDesignation === "P2_ROLE") {
        assignedPlayer = playerRoles["P2_ROLE_IN_TEMPLATE"];
      } else if (roleDesignation === "ROLE_A") {
        assignedPlayer = playerRoles["ROLE_A"];
      } else if (roleDesignation === "ROLE_B") {
        assignedPlayer = playerRoles["ROLE_B"];
      }
    } else {
      // Fallback if playerRoles is empty
      if (roleDesignation === "P1_ROLE") {
        assignedPlayer = "P1";
      } else if (roleDesignation === "P2_ROLE") {
        assignedPlayer = "P2";
      }
    }

    if (step.phase && step.phase.startsWith("BAN")) {
      sequence.bans[assignedPlayer].push(currentOrderNumber++);
    } else if (step.phase && step.phase.startsWith("PICK")) {
      sequence.picks[assignedPlayer].push(currentOrderNumber++);
    }
  });

  return sequence;
}

// Function to get equilibration advantage icons for a player
function getEquilibrationAdvantageIcons(draftState, playerSlot) {
  if (!draftState.equilibrationEnabled) {
    return null;
  }

  const playerRoles = draftState.playerRoles || {};
  const eqBansAllowed = draftState.equilibrationBansAllowed || 0;

  // Determine if this player is the lower score player (P1-ROLE in the role mapping)
  const isLowerScorePlayer = playerRoles["P1_ROLE_IN_TEMPLATE"] === playerSlot;

  if (!isLowerScorePlayer) {
    return null; // Only show badges for the lower score player
  }

  // Build badges array - always start with priority badge
  let badges = [];

  // Lower score player always gets priority
  badges.push(
    `<img src="https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/icons/PRIO.webp" class="equilibration-advantage-badge" title="Priority: Goes first in draft order" alt="Priority Badge">`
  );

  // Add ban badges based on equilibration bans allowed
  if (eqBansAllowed === 1) {
    badges.push(
      `<img src="https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/icons/1BAN.webp" class="equilibration-advantage-badge" title="1 Equilibration Ban" alt="1 Ban Badge">`
    );
  } else if (eqBansAllowed === 2) {
    badges.push(
      `<img src="https://pick-ban-test-2023-10-27.s3.us-east-1.amazonaws.com/images/icons/2BAN.webp" class="equilibration-advantage-badge" title="2 Equilibration Bans" alt="2 Bans Badge">`
    );
  }

  // Wrap badges in a container positioned to the opposite side
  return `<div class="equilibration-badges-container">${badges.join("")}</div>`;
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
  console.log(
    "UPDATE_PICK_SLOTS: Called. P1 Picks:",
    JSON.stringify(draftState.player1Picks),
    "P2 Picks:",
    JSON.stringify(draftState.player2Picks)
  );
  const p1Picks = draftState.player1Picks || [];
  const p2Picks = draftState.player2Picks || [];
  const p1Sequences =
    typeof draftState.player1Sequences === "object" &&
    draftState.player1Sequences !== null
      ? draftState.player1Sequences
      : {};
  const p2Sequences =
    typeof draftState.player2Sequences === "object" &&
    draftState.player2Sequences !== null
      ? draftState.player2Sequences
      : {};

  const currentPhase = draftState.currentPhase;
  const currentTurn = draftState.currentTurn;

  // Calculate draft sequence numbers
  const sequence = calculateDraftSequence(draftState);

  // --- Player 1 Pick Slots ---
  const p1SlotElements = [elements.p1Pick1, elements.p1Pick2, elements.p1Pick3];
  p1SlotElements.forEach((slot, index) => {
    if (!slot) return;
    slot.classList.remove(
      "p1-picked-slot-themed",
      "p2-picked-slot-themed",
      "has-sequence-badge"
    );
    slot.innerHTML = "";

    const pickName = p1Picks[index];
    const isActive =
      currentPhase?.startsWith("PICK") &&
      currentTurn === "P1" &&
      !pickName &&
      index === p1Picks.length;

    if (pickName) {
      // Show character image
      const resonator = findResonatorByName(pickName);
      if (resonator && resonator.image_pick) {
        slot.innerHTML = `<img src="${resonator.image_pick}" alt="${resonator.name}" title="${resonator.name}" style="width: 100%; height: 100%; object-fit: contain;">`;
      } else {
        slot.innerHTML = `<span>${pickName || "?"}</span>`;
      }
      slot.classList.add("p1-picked-slot-themed");

      // Add Sequence Badge if BSS is enabled and it's a 5-star resonator
      if (
        draftState.equilibrationEnabled &&
        resonator &&
        resonator.rarity === 5
      ) {
        const seqVal = p1Sequences[resonator.name];
        if (seqVal !== undefined && seqVal >= 0) {
          const seqBadge = document.createElement("div");
          seqBadge.className = "pick-slot-seq-badge p1-seq-badge-color";
          seqBadge.textContent = seqVal.toString();
          slot.appendChild(seqBadge);
          slot.classList.add("has-sequence-badge");
        }
      }
    } else {
      // Show numbered placeholder
      const orderNumber = sequence.picks.P1[index];
      if (orderNumber) {
        const orderNumberClass = isActive
          ? "draft-order-number active-pulse"
          : "draft-order-number";
        slot.innerHTML = `<div class="${orderNumberClass}">${orderNumber}</div>`;
      }
    }
    updateSlotGlowState(slot, isActive, !!pickName, "pick");
  });

  // --- Player 2 Pick Slots ---
  const p2SlotElements = [elements.p2Pick1, elements.p2Pick2, elements.p2Pick3];
  p2SlotElements.forEach((slot, index) => {
    if (!slot) return;
    slot.classList.remove(
      "p1-picked-slot-themed",
      "p2-picked-slot-themed",
      "has-sequence-badge"
    );
    slot.innerHTML = "";

    const pickName = p2Picks[index];
    const isActive =
      currentPhase?.startsWith("PICK") &&
      currentTurn === "P2" &&
      !pickName &&
      index === p2Picks.length;

    if (pickName) {
      // Show character image
      const resonator = findResonatorByName(pickName);
      if (resonator && resonator.image_pick) {
        slot.innerHTML = `<img src="${resonator.image_pick}" alt="${resonator.name}" title="${resonator.name}" style="width: 100%; height: 100%; object-fit: contain;">`;
      } else {
        slot.innerHTML = `<span>${pickName || "?"}</span>`;
      }
      slot.classList.add("p2-picked-slot-themed");

      // Add Sequence Badge if BSS is enabled and it's a 5-star resonator
      if (
        draftState.equilibrationEnabled &&
        resonator &&
        resonator.rarity === 5
      ) {
        const seqVal = p2Sequences[resonator.name];
        if (seqVal !== undefined && seqVal >= 0) {
          const seqBadge = document.createElement("div");
          seqBadge.className = "pick-slot-seq-badge p2-seq-badge-color";
          seqBadge.textContent = seqVal.toString();
          slot.appendChild(seqBadge);
          slot.classList.add("has-sequence-badge");
        }
      }
    } else {
      // Show numbered placeholder
      const orderNumber = sequence.picks.P2[index];
      if (orderNumber) {
        const orderNumberClass = isActive
          ? "draft-order-number active-pulse"
          : "draft-order-number";
        slot.innerHTML = `<div class="${orderNumberClass}">${orderNumber}</div>`;
      }
    }
    updateSlotGlowState(slot, isActive, !!pickName, "pick");
  });
}

// --- ADD NEW FUNCTION for Ban Slots ---
function updateBanSlots(draftState) {
  const allBans = draftState.bans || [];
  const currentPhase = draftState.currentPhase;
  const currentTurn = draftState.currentTurn;

  const isEqEnabled = draftState.equilibrationEnabled;
  const eqBansAllowed = isEqEnabled
    ? draftState.equilibrationBansAllowed || 0
    : 0;
  // *** KEY CHANGE: Use the number of bans MADE as the source of truth ***
  const eqBansMadeByLSP = isEqEnabled
    ? draftState.equilibrationBansMade || 0
    : 0;
  const eqBanner = isEqEnabled ? draftState.currentEquilibrationBanner : null;

  // Calculate draft sequence numbers
  const sequence = calculateDraftSequence(draftState);

  console.log(
    `[updateBanSlots] CALLED. Phase: ${currentPhase}, Turn: ${currentTurn}, MySlot: ${state.myAssignedSlot}`
  );
  console.log(
    `[updateBanSlots] EQ_DETAILS: Allowed=${eqBansAllowed}, Made=${eqBansMadeByLSP}, Banner=${eqBanner}`
  );
  console.log(`[updateBanSlots] allBans from server:`, JSON.stringify(allBans));

  // Clear existing ban slots from both player areas
  if (elements.topBarP1Bans) {
    elements.topBarP1Bans.innerHTML = "";
  }
  if (elements.topBarP2Bans) {
    elements.topBarP2Bans.innerHTML = "";
  }

  const p1Bans = [];
  const p2Bans = [];

  // 1. Create UI slots for any ALLOWED Equilibration Bans
  if (isEqEnabled && eqBanner) {
    for (let i = 0; i < eqBansAllowed; i++) {
      // Determine if this specific EQ ban was actually made.
      const wasThisEqBanMade = i < eqBansMadeByLSP;

      // *** ADD THIS LINE ***
      // A ban was skipped if the phase is past EQ, but this ban was never made.
      // Also exclude predraft phase (when currentPhase is null) from showing timeout.
      const wasSkippedByTimeout =
        currentPhase !== null &&
        currentPhase !== EQUILIBRATION_PHASE_NAME &&
        !wasThisEqBanMade;

      const banData = {
        // *** KEY CHANGE: Only take a ban name if it was actually an EQ ban ***
        banName: wasThisEqBanMade ? allBans[i] : null,
        isFilled: wasThisEqBanMade,
        isActiveForPulse:
          currentPhase === EQUILIBRATION_PHASE_NAME &&
          currentTurn === eqBanner &&
          i === eqBansMadeByLSP,
        isDisabled: false, // Will be styled as disabled if not filled
        type: "eq",
        orderNumber: sequence.eqBans[eqBanner]
          ? sequence.eqBans[eqBanner][i]
          : null,
        // *** ADD THIS NEW PROPERTY ***
        wasSkipped: wasSkippedByTimeout,
      };

      if (eqBanner === "P1") {
        p1Bans.push(banData);
      } else {
        p2Bans.push(banData);
      }
    }
  }

  // 2. Process and assign ALL standard bans
  // *** KEY CHANGE: The offset is now the number of EQ bans that were actually MADE ***
  const standardBanOffset = eqBansMadeByLSP;
  const standardBans = allBans.slice(standardBanOffset);

  // Determine the correct player for each standard ban slot based on draft order
  const standardBanSteps = (draftState.effectiveDraftOrder || []).filter(
    (step) => step.phase && step.phase.startsWith("BAN")
  );

  for (let i = 0; i < 4; i++) {
    // Always create 4 standard ban slots
    const banName = i < standardBans.length ? standardBans[i] : null;
    let assignedPlayer = i % 2 === 0 ? "P1" : "P2"; // Default alternating assignment

    // Determine owner from draft order if possible
    if (i < standardBanSteps.length) {
      const step = standardBanSteps[i];
      const role = step.turnPlayerDesignation;
      const playerRoles = draftState.playerRoles || {};

      if (playerRoles.P1_ROLE_IN_TEMPLATE) {
        // P1 Favored Order
        assignedPlayer =
          role === "P1_ROLE"
            ? playerRoles.P1_ROLE_IN_TEMPLATE
            : playerRoles.P2_ROLE_IN_TEMPLATE;
      } else if (playerRoles.ROLE_A) {
        // Neutral Order
        assignedPlayer =
          role === "ROLE_A" ? playerRoles.ROLE_A : playerRoles.ROLE_B;
      }
    }

    const banData = {
      banName: banName,
      isFilled: !!banName,
      isActiveForPulse:
        !banName && // Slot must be empty
        currentPhase?.startsWith("BAN") &&
        allBans.length === standardBanOffset + i, // It's the very next ban to be made
      isDisabled: false,
      type: "standard",
      orderNumber: null, // Will be set below
    };

    // Add order number to ban data
    if (assignedPlayer === "P1") {
      banData.orderNumber =
        sequence.bans.P1[p1Bans.filter((b) => b.type === "standard").length];
      p1Bans.push(banData);
    } else {
      banData.orderNumber =
        sequence.bans.P2[p2Bans.filter((b) => b.type === "standard").length];
      p2Bans.push(banData);
    }
  }

  // 3. Render the constructed ban lists
  p1Bans.forEach((banData, index) => {
    const slot = createBanSlotElement(banData, `p1-ban-${index}`);
    if (elements.topBarP1Bans) {
      elements.topBarP1Bans.appendChild(slot);
    }
  });

  p2Bans.forEach((banData, index) => {
    const slot = createBanSlotElement(banData, `p2-ban-${index}`);
    if (elements.topBarP2Bans) {
      elements.topBarP2Bans.appendChild(slot);
    }
  });
}

// Helper function to create individual ban slot elements
function createBanSlotElement(banData, slotId) {
  const slot = document.createElement("div");
  slot.className = "ban-slot";
  slot.id = slotId;
  slot.innerHTML = "";

  // Add ban type class for styling
  if (banData.type === "eq") {
    slot.classList.add("ban-slot-eq");
  } else if (banData.type === "standard") {
    slot.classList.add("ban-slot-standard");
  }

  // *** START OF NEW/MODIFIED LOGIC ***
  // Check if the ban was skipped by a timeout
  if (banData.wasSkipped) {
    slot.classList.add("ban-slot-skipped");
    slot.innerHTML = `<img src="https://wuwadraft.s3.us-east-1.amazonaws.com/images/other/timeout_placeholder.webp" alt="Timeout" title="Ban Skipped (Timeout)" class="ban-slot-timeout-img">`;
  }
  // Check if the slot is explicitly disabled (e.g., not enough EQ bans allowed)
  else if (banData.isDisabled) {
    slot.classList.add("ban-slot-disabled");
    // Add padlock icon for disabled slots
    slot.innerHTML = `
      <div style="position: absolute; top: 68%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
        <i class="bi bi-lock-fill" style="font-size: 1.5rem; color: #6c757d; opacity: 0.8; filter: drop-shadow(0 0 2px rgba(0,0,0,0.2)); display: block;"></i>
        <small class="text-muted mt-1" style="font-size: 0.7rem; display: block;">Disabled</small>
      </div>
    `;
  }
  // Otherwise, handle normal filled/empty slots
  else {
    slot.classList.remove("ban-slot-disabled", "pulse-ban", "glow-ban");

    if (banData.banName) {
      // Show character image for a filled slot
      const resonator = findResonatorByName(banData.banName);
      slot.innerHTML =
        resonator && resonator.image_button
          ? `<img src="${resonator.image_button}" alt="${banData.banName}" title="${banData.banName}" style="max-width: 90%; max-height: 90%; object-fit: cover; border-radius: 3px;">`
          : `<span>X</span>`;
    } else if (banData.orderNumber) {
      // Show numbered placeholder for an empty, waiting slot
      const orderNumberClass = banData.isActiveForPulse
        ? "draft-order-number ban-order-number active-pulse"
        : "draft-order-number ban-order-number";
      slot.innerHTML = `<div class="${orderNumberClass}">${banData.orderNumber}</div>`;
    }

    // Apply visual state (glow/pulse)
    updateSlotGlowState(
      slot,
      banData.isActiveForPulse,
      banData.isFilled,
      "ban"
    );
  }
  // *** END OF NEW/MODIFIED LOGIC ***

  return slot;
}

// --- ADD TIMER DISPLAY FUNCTIONS ---

// Helper function to sync top bar timer with main timer
function syncTopBarTimer() {
  // No longer needed since we're updating the top bar directly
  return;
}

export function stopTimerDisplay() {
  // console.log("UI_VIEWS_TIMER: stopTimerDisplay called.");
  state.clearTimerInterval(); // Clears intervalId in state.js AND calls clearInterval

  const timerElement = elements.draftTimerTop; // Use top bar timer instead
  // Only try to update DOM if the timer element is actually part of the current document
  if (timerElement && document.body.contains(timerElement)) {
    const timerTextSpan = timerElement.querySelector("span");
    if (timerTextSpan) {
      timerTextSpan.textContent = "--:--";
    } else {
      // This warning is acceptable if the span was, e.g., cleared by other DOM manipulation
      // console.warn("UI_VIEWS_TIMER: stopTimerDisplay - timerTextSpan not found within existing timerElement.");
    }
    timerElement.classList.remove("timer-low");
  } else {
    // console.warn("UI_VIEWS_TIMER: stopTimerDisplay - elements.draftTimerTop not found or not in DOM.");
  }
}

// This internal function updates the clock display
function updateCountdown(expiryTime, intervalId) {
  // Check if this interval should still be running
  if (state.timerIntervalId === null || intervalId !== state.timerIntervalId) {
    console.log(
      `UI_VIEWS_TIMER: updateCountdown (interval ${intervalId}) - Mismatch or timer already cleared by state (${state.timerIntervalId}). Clearing this interval.`
    );
    clearInterval(intervalId);
    return;
  }

  const timerElement = elements.draftTimerTop; // Use top bar timer instead
  if (!timerElement || !document.body.contains(timerElement)) {
    console.warn(
      "UI_VIEWS_TIMER: updateCountdown - elements.draftTimerTop NOT FOUND or not in DOM. Clearing interval.",
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
    timerTextSpan.textContent = "00:00";
    timerElement.classList.add("timer-low");

    clearInterval(intervalId); // Stop this interval

    // --- DETAILED LOGGING FOR TIMEOUT DECISION ---
    const isMyTurn = state.myAssignedSlot === state.currentTurn;
    const isCurrentInterval = state.timerIntervalId === intervalId;
    const currentTimerIdInState = state.timerIntervalId;

    console.log(
      `UI_VIEWS_TIMER_EXPIRED: intervalId=${intervalId} reached 0ms.`
    );
    console.log(
      `UI_VIEWS_TIMER_EXPIRED: Is it my turn? (mySlot: ${state.myAssignedSlot} === currentTurn: ${state.currentTurn}) -> ${isMyTurn}`
    );
    console.log(
      `UI_VIEWS_TIMER_EXPIRED: Is this the current interval? (this intervalId: ${intervalId} === state.timerIntervalId: ${currentTimerIdInState}) -> ${isCurrentInterval}`
    );

    if (isMyTurn && isCurrentInterval) {
      console.log(
        "UI_VIEWS_TIMER_EXPIRED: CONDITIONS MET. Sending turnTimeout action."
      );
      sendMessageToServer({
        action: "turnTimeout",
        expectedPhase: state.currentPhase,
        expectedTurn: state.myAssignedSlot,
      });
    } else {
      console.log(
        "UI_VIEWS_TIMER_EXPIRED: CONDITIONS NOT MET. Not sending turnTimeout."
      );
      if (!isMyTurn) {
        console.log(
          `UI_VIEWS_TIMER_EXPIRED: Reason: Not my turn (mySlot: ${state.myAssignedSlot}, currentTurn: ${state.currentTurn})`
        );
      }
      if (!isCurrentInterval) {
        console.log(
          `UI_VIEWS_TIMER_EXPIRED: Reason: Not the current timer interval (thisId: ${intervalId}, stateId: ${currentTimerIdInState})`
        );
      }
    }
    state.clearTimerInterval(); // Clear from state AFTER sending timeout
  } else {
    const remainingSeconds = Math.floor(remainingMs / 1000);
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    timerTextSpan.textContent = `${String(minutes).padStart(2, "0")}:${String(
      seconds
    ).padStart(2, "0")}`;

    if (remainingSeconds <= 10) {
      timerElement.classList.add("timer-low");
    } else {
      timerElement.classList.remove("timer-low");
    }
  }
}

// This function starts a new timer cycle
export function startOrUpdateTimerDisplay() {
  console.log(
    "TIMER_START_ATTEMPT: Using state.currentTurnExpiresAt =",
    state.currentTurnExpiresAt,
    " (Type:",
    typeof state.currentTurnExpiresAt,
    ")"
  );
  stopTimerDisplay(); // Clear any previous timer first

  if (!state.currentTurnExpiresAt) {
    console.log(
      "TIMER_START_ATTEMPT: No valid currentTurnExpiresAt in state. Timer will not start."
    );
    return;
  }

  const timerElement = elements.draftTimerTop; // Use top bar timer instead
  // Ensure the timer element exists and has its necessary child span before starting.
  // This is important if the draft screen was just made active.
  if (!timerElement || !document.body.contains(timerElement)) {
    console.warn(
      "UI_VIEWS_TIMER: startOrUpdateTimerDisplay - elements.draftTimerTop NOT FOUND or not in DOM. Timer not starting."
    );
    return;
  }
  // Ensure the inner structure (span) is present
  if (!timerElement.querySelector("span")) {
    timerElement.innerHTML =
      '<i class="bi bi-clock timer-icon me-1"></i> <span>--:--</span>';
  }

  try {
    const expiryTimestamp = new Date(state.currentTurnExpiresAt).getTime();
    const now = Date.now();
    const initialRemainingMs = expiryTimestamp - now; // Calculate initial remaining
    console.log(
      `TIMER_INIT: Initial remainingMs = ${initialRemainingMs} (ServerExpiry: ${expiryTimestamp}, ClientNow: ${now})`
    );

    if (isNaN(expiryTimestamp)) {
      console.error(
        "UI_VIEWS_TIMER: Invalid expiry timestamp:",
        state.currentTurnExpiresAt
      );
      return;
    }

    if (initialRemainingMs <= 0) {
      console.log(
        "TIMER_INIT: Turn already expired or will expire in next tick."
      );
      const timerTextSpan = timerElement.querySelector("span");
      if (timerTextSpan) {
        timerTextSpan.textContent = "00:00";
      }
      timerElement.classList.add("timer-low");

      return;
    }

    const newIntervalId = setInterval(() => {
      updateCountdown(expiryTimestamp, newIntervalId);
    }, 1000);
    state.setTimerIntervalId(newIntervalId); // Store the new interval ID in state

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
  console.log(
    "[updateDraftScreenUI CALLED] isCurrentUserHost:",
    state.isCurrentUserHost,
    "myAssignedSlot:",
    state.myAssignedSlot
  );
  if (!elements || !elements.draftScreen) {
    return;
  }

  const isHost = state.isCurrentUserHost;
  const isPreDraftReadyState = draftState.lobbyState === "PRE_DRAFT_READY";
  const isDraftComplete = draftState.currentPhase === "DRAFT_COMPLETE";

  // Manage visibility of the main control containers
  toggleElementVisibility(elements.draftHostControls, isHost);
  toggleElementVisibility(elements.draftPlayerControls, !isHost);

  // If the user is the host, decide which specific host buttons to show
  if (isHost) {
    // Manage Start Draft button visibility
    if (elements.hostStartDraftBtn) {
      toggleElementVisibility(elements.hostStartDraftBtn, isPreDraftReadyState);
      // Ensure button is enabled if it's visible and was previously disabled
      if (isPreDraftReadyState && elements.hostStartDraftBtn.disabled) {
        elements.hostStartDraftBtn.disabled = false;
        elements.hostStartDraftBtn.innerHTML =
          '<i class="bi bi-play-circle-fill"></i> Start Draft';
      }
    }

    // Manage Reset Draft button visibility
    if (elements.hostResetDraftBtn) {
      // Show Reset button if the host is viewing the draft screen AND
      // the draft is NOT in the "PRE_DRAFT_READY" state (i.e., it's active or complete)
      const showResetButton = !isPreDraftReadyState;
      toggleElementVisibility(elements.hostResetDraftBtn, showResetButton);
    }

    // Manage Delete Lobby button visibility
    if (elements.hostDeleteDraftLobbyBtn) {
      toggleElementVisibility(elements.hostDeleteDraftLobbyBtn, true);
    }
  }

  // If draft is complete, handle UI and return early
  if (isDraftComplete) {
    console.log(
      "UIVIEWS_DRAFT_COMPLETE: Rendering Draft Complete state. Full draftState:",
      JSON.stringify(draftState)
    );
    console.log(
      "UIVIEWS_DRAFT_COMPLETE: (Log 1) P1 Picks before updatePickSlots:",
      JSON.stringify(draftState.player1Picks)
    );
    console.log(
      "UIVIEWS_DRAFT_COMPLETE: (Log 1) P2 Picks before updatePickSlots:",
      JSON.stringify(draftState.player2Picks)
    );

    if (elements.hostStartDraftBtn) {
      toggleElementVisibility(elements.hostStartDraftBtn, false);
    }
    stopTimerDisplay();

    // Update top bar timer and phase status for draft complete
    if (elements.draftTimerTop) {
      const timerTextSpan = elements.draftTimerTop.querySelector("span");
      if (timerTextSpan) {
        stopTimerDisplay();
        timerTextSpan.textContent = "Draft Complete!";
        elements.draftTimerTop.classList.remove("timer-low");
        console.log(
          "UIVIEWS_DRAFT_COMPLETE: Updated top bar timer to 'Draft Complete!'"
        );
      }
    }

    if (elements.draftPhaseStatusTop) {
      // Hide the phase status when draft is complete since it's no longer relevant
      elements.draftPhaseStatusTop.style.display = "none";
      console.log(
        "UIVIEWS_DRAFT_COMPLETE: Hidden top bar phase status since draft is complete"
      );
    }

    // Add log right before updatePickSlots to check for mutations
    console.log(
      "UIVIEWS_DRAFT_COMPLETE: (Log 2) P2 Picks JUST BEFORE calling updatePickSlots:",
      JSON.stringify(draftState.player2Picks)
    );

    updatePickSlots(draftState);
    updateBanSlots(draftState);

    // Instead of clearing the grid, render it one last time
    try {
      renderCharacterGrid(draftState);
    } catch (gridError) {
      console.error(
        "Error calling renderCharacterGrid during draft complete:",
        gridError
      );
    }

    // Hide filter controls as they are no longer functional
    const filterControls = document.getElementById("draft-filter-controls");
    if (filterControls) {
      filterControls.style.display = "none";
    }

    // Remove active turn highlighting from player areas
    const playerAreas = document.querySelectorAll(
      ".draft-main-flex-container .player-area"
    );
    playerAreas.forEach((area) => area.classList.remove("active-turn"));

    return;
  }

  // Timer Display Management
  if (elements.draftTimerTop) {
    const timerTextSpan = elements.draftTimerTop.querySelector("span");
    if (timerTextSpan) {
      if (isPreDraftReadyState) {
        stopTimerDisplay();
        timerTextSpan.textContent = "Waiting for Host to Start Draft...";
        elements.draftTimerTop.classList.remove("timer-low");
      } else if (draftState.currentPhase && draftState.turnExpiresAt) {
        startOrUpdateTimerDisplay();
      } else {
        stopTimerDisplay();
        timerTextSpan.textContent = "--:--";
        elements.draftTimerTop.classList.remove("timer-low");
      }
    }
  }

  // Update Phase and Turn Status & Apply Class
  if (elements.draftPhaseStatusTop) {
    elements.draftPhaseStatusTop.classList.remove(
      "phase-ban",
      "phase-pick",
      "phase-complete",
      "text-success",
      "fw-bold"
    );

    if (isPreDraftReadyState) {
      elements.draftPhaseStatusTop.style.display = ""; // Ensure it's visible
      elements.draftPhaseStatusTop.textContent =
        "Prepare for Draft - Waiting for Host";
    } else {
      elements.draftPhaseStatusTop.style.display = ""; // Ensure it's visible
      const currentPhase = draftState.currentPhase || "N/A";
      const turnPlayerName =
        draftState.currentTurn === "P1"
          ? draftState.player1Name || "Player 1"
          : draftState.player2Name || "Player 2";
      const isMyTurnText =
        state.myAssignedSlot === draftState.currentTurn ? " (Your Turn)" : "";

      elements.draftPhaseStatusTop.textContent = `Phase: ${currentPhase} | ${turnPlayerName}'s Turn${isMyTurnText}`;

      if (
        currentPhase.startsWith("BAN") ||
        currentPhase === EQUILIBRATION_PHASE_NAME
      ) {
        elements.draftPhaseStatusTop.classList.add("phase-ban");
      } else if (currentPhase.startsWith("PICK")) {
        elements.draftPhaseStatusTop.classList.add("phase-pick");
      }
    }
  } else {
    console.warn("UI Update Warning: Draft phase status element not found");
  }

  // Update player names with color coding
  if (elements.draftP1Name && draftState.player1Name) {
    elements.draftP1Name.innerHTML = `<span class="p1-name-colored">${draftState.player1Name}</span>`;
    // Get the parent h4 element and add themed class
    const p1Header = elements.draftP1Name.closest("h4");
    if (p1Header) {
      p1Header.classList.add("p1-themed-header");
      p1Header.classList.remove("p2-themed-header");

      // Add equilibration advantage badge if applicable - only if not already present
      if (draftState.equilibrationEnabled) {
        const existingBadges = p1Header.querySelector(
          ".equilibration-badges-container"
        );
        if (!existingBadges) {
          const p1AdvantageIcons = getEquilibrationAdvantageIcons(
            draftState,
            "P1"
          );
          if (p1AdvantageIcons) {
            p1Header.insertAdjacentHTML("beforeend", p1AdvantageIcons);
            // Remove automatic animation listeners since we only want hover effects
          }
        }
      }
    }
  } else if (elements.draftP1Name) {
    elements.draftP1Name.textContent = "Waiting for Player 1...";
    const p1Header = elements.draftP1Name.closest("h4");
    if (p1Header) {
      p1Header.classList.remove("p1-themed-header", "p2-themed-header");
    }
  }

  // Update top bar P1 name
  if (elements.topBarP1Name && draftState.player1Name) {
    elements.topBarP1Name.innerHTML = `<span class="p1-name-colored">${draftState.player1Name}</span>`;

    // Add equilibration advantage badge if applicable - only if not already present
    if (draftState.equilibrationEnabled) {
      const p1TopBarHeader = elements.topBarP1Name.closest(
        "h4.player-name-top-bar"
      );
      if (p1TopBarHeader) {
        const existingBadges = p1TopBarHeader.querySelector(
          ".equilibration-badges-container"
        );
        if (!existingBadges) {
          const p1AdvantageIcons = getEquilibrationAdvantageIcons(
            draftState,
            "P1"
          );
          if (p1AdvantageIcons) {
            p1TopBarHeader.insertAdjacentHTML("beforeend", p1AdvantageIcons);
            // Remove automatic animation listeners since we only want hover effects
          }
        }
      }
    }
  } else if (elements.topBarP1Name) {
    elements.topBarP1Name.textContent = "Player 1";
  }

  if (elements.draftP2Name && draftState.player2Name) {
    elements.draftP2Name.innerHTML = `<span class="p2-name-colored">${draftState.player2Name}</span>`;
    // Get the parent h4 element and add themed class
    const p2Header = elements.draftP2Name.closest("h4");
    if (p2Header) {
      p2Header.classList.add("p2-themed-header");
      p2Header.classList.remove("p1-themed-header");

      // Add equilibration advantage badge if applicable - only if not already present
      if (draftState.equilibrationEnabled) {
        const existingBadges = p2Header.querySelector(
          ".equilibration-badges-container"
        );
        if (!existingBadges) {
          const p2AdvantageIcons = getEquilibrationAdvantageIcons(
            draftState,
            "P2"
          );
          if (p2AdvantageIcons) {
            p2Header.insertAdjacentHTML("beforeend", p2AdvantageIcons);
            // Remove automatic animation listeners since we only want hover effects
          }
        }
      }
    }
  } else if (elements.draftP2Name) {
    elements.draftP2Name.textContent = "Waiting for Player 2...";
    const p2Header = elements.draftP2Name.closest("h4");
    if (p2Header) {
      p2Header.classList.remove("p1-themed-header", "p2-themed-header");
    }
  }

  // Update top bar P2 name
  if (elements.topBarP2Name && draftState.player2Name) {
    elements.topBarP2Name.innerHTML = `<span class="p2-name-colored">${draftState.player2Name}</span>`;

    // Add equilibration advantage badge if applicable - only if not already present
    if (draftState.equilibrationEnabled) {
      const p2TopBarHeader = elements.topBarP2Name.closest(
        "h4.player-name-top-bar"
      );
      if (p2TopBarHeader) {
        const existingBadges = p2TopBarHeader.querySelector(
          ".equilibration-badges-container"
        );
        if (!existingBadges) {
          const p2AdvantageIcons = getEquilibrationAdvantageIcons(
            draftState,
            "P2"
          );
          if (p2AdvantageIcons) {
            p2TopBarHeader.insertAdjacentHTML("beforeend", p2AdvantageIcons);
            // Remove automatic animation listeners since we only want hover effects
          }
        }
      }
    }
  } else if (elements.topBarP2Name) {
    elements.topBarP2Name.textContent = "Player 2";
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

  // The timer management is now handled in the unified timer display logic block above
  // No need for additional timer calls at the end of the function
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

export function applyCharacterFilter() {
  // This function is now just a trigger to re-render the grid.
  // main.js is responsible for setting state.activeElementFilter and state.activeRarityFilter.
  console.log(
    `UI_VIEWS: applyCharacterFilter called. Element filter from state: ${state.activeElementFilter}, Rarity filter from state: ${state.activeRarityFilter}`
  );

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
    `RENDER_GRID_ENTRY_FILTERS: Initial state.activeElementFilter = '${
      state.activeElementFilter
    }', Initial state.activeRarityFilter = '${
      state.activeRarityFilter
    }' (Type of rarity filter: ${typeof state.activeRarityFilter})`
  );

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

  if (!elements.characterGridContainer) {
    console.error(
      "RENDER_GRID_ERROR: elements.characterGridContainer is null or undefined!"
    );
    return;
  }

  // Get active filters from state
  const activeElementFilter = state.activeElementFilter || "All";
  const activeRarityFilter = state.activeRarityFilter;

  console.log(
    `RENDER_GRID: Applying filters - Element: ${activeElementFilter}, Rarity: ${activeRarityFilter}`
  );

  // Check if this is a full re-render (filter change) or just state update
  const needsFullRebuild =
    !elements.characterGridContainer.hasChildNodes() ||
    elements.characterGridContainer.dataset.lastElementFilter !==
      activeElementFilter ||
    elements.characterGridContainer.dataset.lastRarityFilter !==
      activeRarityFilter;

  if (needsFullRebuild) {
    // Full rebuild needed - clear and recreate
    elements.characterGridContainer.innerHTML = "";
    elements.characterGridContainer.dataset.lastElementFilter =
      activeElementFilter;
    elements.characterGridContainer.dataset.lastRarityFilter =
      activeRarityFilter;

    // Continue with full rebuild logic...
    createCharacterButtons(draftState, activeElementFilter, activeRarityFilter);
  } else {
    // Just update existing buttons
    updateExistingCharacterButtons(draftState);
  }
}

function createCharacterButtons(
  draftState,
  activeElementFilter,
  activeRarityFilter
) {
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

  // Filter ALL_RESONATORS_DATA based on both activeElementFilter and activeRarityFilter
  let resonatorsToDisplay = ALL_RESONATORS_DATA;

  // 1. Apply Rarity Filter (if one is selected)
  if (activeRarityFilter) {
    const rarityNum = parseInt(activeRarityFilter, 10);
    resonatorsToDisplay = resonatorsToDisplay.filter(
      (resonator) => resonator.rarity === rarityNum
    );
  }

  // 2. Apply Element Filter (if one is selected and not "All")
  if (activeElementFilter && activeElementFilter !== "All") {
    resonatorsToDisplay = resonatorsToDisplay.filter(
      (resonator) =>
        Array.isArray(resonator.element) &&
        resonator.element.includes(activeElementFilter)
    );
  }

  if (resonatorsToDisplay.length === 0) {
    let message = "No resonators match the current filter criteria.";
    if (activeElementFilter !== "All" && !activeRarityFilter) {
      message = `No resonators match the '${activeElementFilter}' element filter.`;
    } else if (activeElementFilter === "All" && activeRarityFilter) {
      message = `No resonators match the '${activeRarityFilter}-Star' rarity filter.`;
    } else if (activeElementFilter !== "All" && activeRarityFilter) {
      message = `No resonators match the '${activeRarityFilter}-Star ${activeElementFilter}' filter combination.`;
    }
    elements.characterGridContainer.innerHTML = `<p class="text-center text-muted fst-italic">${message}</p>`;
  } else if (ALL_RESONATORS_DATA.length === 0) {
    // Should not happen unless ALL_RESONATORS_DATA is empty
    elements.characterGridContainer.innerHTML = `<p class="text-center text-danger">Error: No resonators found.</p>`;
  }

  // Loop over the filtered list
  resonatorsToDisplay.forEach((resonator) => {
    const button = createCharacterButton(resonator, draftState);
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

function createCharacterButton(resonator, draftState) {
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

  updateCharacterButtonState(button, resonator, draftState);
  return button;
}

function updateExistingCharacterButtons(draftState) {
  const existingButtons =
    elements.characterGridContainer.querySelectorAll(".character-button");
  existingButtons.forEach((button) => {
    const resonatorName = button.dataset.resonatorName;
    const resonator = findResonatorByName(resonatorName);
    if (resonator) {
      updateCharacterButtonState(button, resonator, draftState);
    }
  });
}

function updateCharacterButtonState(button, resonator, draftState) {
  // Remove existing sequence badges
  const existingBadges = button.querySelectorAll(".char-seq-badge");
  existingBadges.forEach((badge) => badge.remove());

  // --- MODIFY SEQUENCE OVERLAY LOGIC ---
  // Show sequence badges if BSS is enabled AND it's a 5-star resonator
  if (draftState.equilibrationEnabled && resonator.rarity === 5) {
    const p1Sequences =
      typeof draftState.player1Sequences === "object" &&
      draftState.player1Sequences !== null
        ? draftState.player1Sequences
        : {};
    const p2Sequences =
      typeof draftState.player2Sequences === "object" &&
      draftState.player2Sequences !== null
        ? draftState.player2Sequences
        : {};

    const p1SeqVal = p1Sequences[resonator.name];
    const p2SeqVal = p2Sequences[resonator.name];

    if (p1SeqVal !== undefined && p1SeqVal >= 0) {
      const p1SeqBadge = document.createElement("div");
      p1SeqBadge.className = "char-seq-badge p1-seq-badge";
      p1SeqBadge.textContent = p1SeqVal.toString();
      button.appendChild(p1SeqBadge);
    }

    if (p2SeqVal !== undefined && p2SeqVal >= 0) {
      const p2SeqBadge = document.createElement("div");
      p2SeqBadge.className = "char-seq-badge p2-seq-badge";
      p2SeqBadge.textContent = p2SeqVal.toString();
      button.appendChild(p2SeqBadge);
    }
  }

  // Determine button state based on draftState
  const availableResonatorsFromServer = draftState.availableResonators || [];
  const player1Picks = draftState.player1Picks || [];
  const player2Picks = draftState.player2Picks || [];
  const bans = draftState.bans || [];
  const currentTurn = draftState.currentTurn || state.currentTurn;

  const isMyTurn = state.myAssignedSlot === currentTurn;
  const availableSet = new Set(availableResonatorsFromServer);
  const p1PicksSet = new Set(player1Picks);
  const p2PicksSet = new Set(player2Picks);
  const bansSet = new Set(bans);

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
    "just-selected",
    "not-clickable"
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

  // Only handle event listener replacement if button is already in the DOM
  if (button.parentNode) {
    // Remove existing event listeners by replacing the button
    const newButton = button.cloneNode(true);
    button.parentNode.replaceChild(newButton, button);

    // Add listener ONLY if clickable
    if (isClickable) {
      newButton.addEventListener("click", handleCharacterSelection);
    } else {
      // Optionally add a 'not-clickable' class for styling disabled buttons differently
      newButton.classList.add("not-clickable");
    }
  } else {
    // Button not in DOM yet (initial creation), just add event listener directly
    if (isClickable) {
      button.addEventListener("click", handleCharacterSelection);
    } else {
      button.classList.add("not-clickable");
    }
  }
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
    const isLimited = select.dataset.isLimited === "true"; // Get isLimited status from dataset
    let charPoints = 0;

    // Only calculate points if the resonator is limited and sequence is valid (S0-S6)
    if (isLimited && sequenceValue >= 0 && sequenceValue <= 6) {
      charPoints = SEQUENCE_POINTS[sequenceValue] || 0;
    }
    // For non-limited 5-stars, charPoints remains 0.

    const pointsDisplayElement = select
      .closest(".row")
      ?.querySelector(".resonator-points-display");
    if (pointsDisplayElement) {
      pointsDisplayElement.innerHTML = `<small>Points: ${charPoints}</small>`;
    }

    totalScore += charPoints; // Only limited characters will add to totalScore
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

  let lastSubmittedSequences = {};
  try {
    const savedData = localStorage.getItem(LOCAL_STORAGE_SEQUENCES_KEY);
    if (savedData) {
      lastSubmittedSequences = JSON.parse(savedData);
    }
  } catch (e) {
    console.warn(
      "POPULATE_BSS_WARN: Could not parse sequences from localStorage.",
      e
    );
    lastSubmittedSequences = {};
  }

  elements.limitedResonatorsList.innerHTML = "";

  // Get ALL 5-star resonators
  const fiveStarResonators = ALL_RESONATORS_DATA.filter(
    (resonator) => resonator.rarity === 5 && resonator.name !== "Rover"
  );

  // Sort them so limited ones appear first, then by name
  fiveStarResonators.sort((a, b) => {
    if (a.isLimited && !b.isLimited) return -1;
    if (!a.isLimited && b.isLimited) return 1;
    return a.name.localeCompare(b.name);
  });

  if (fiveStarResonators.length === 0) {
    elements.limitedResonatorsList.innerHTML =
      '<p class="text-muted">No 5-star resonators found to declare sequences for.</p>';
    updateTotalBoxScore();
    return;
  }

  fiveStarResonators.forEach((resonator) => {
    const resonatorRow = document.createElement("div");
    resonatorRow.className =
      "row mb-3 align-items-center justify-content-center border-bottom pb-2";

    const nameLabel = document.createElement("label");
    nameLabel.className = "col-md-4 col-form-label text-md-end fw-bold";
    nameLabel.textContent = `${resonator.name}:`;

    // Add a small indicator if the resonator is limited (for scoring)
    if (resonator.isLimited) {
      const limitedBadge = document.createElement("span");
      limitedBadge.className = "badge bg-warning text-dark ms-2 small";
      limitedBadge.textContent = "Score Counts";
      limitedBadge.title =
        "Sequence for this Limited Resonator contributes to the Weighted Box Score.";
      nameLabel.appendChild(limitedBadge);
    } else {
      const standardBadge = document.createElement("span");
      standardBadge.className = "badge bg-secondary ms-2 small";
      standardBadge.textContent = "Standard";
      standardBadge.title =
        "Sequence for this Standard 5-Star Resonator is for display only and does NOT contribute to the Weighted Box Score.";
      nameLabel.appendChild(standardBadge);
    }

    const selectDiv = document.createElement("div");
    selectDiv.className = "col-md-3";
    const selectElement = document.createElement("select");
    selectElement.className = "form-select sequence-select text-center";
    selectElement.dataset.resonatorName = resonator.name;
    // Store isLimited status directly on the select element for updateTotalBoxScore
    selectElement.dataset.isLimited = resonator.isLimited ? "true" : "false";
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

    const previouslySelectedValue = lastSubmittedSequences[resonator.name];
    if (
      previouslySelectedValue !== undefined &&
      parseInt(previouslySelectedValue) >= -1 &&
      parseInt(previouslySelectedValue) <= 6
    ) {
      selectElement.value = previouslySelectedValue.toString();
    } else {
      selectElement.value = "-1";
    }

    selectElement.addEventListener("change", updateTotalBoxScore);
    selectDiv.appendChild(selectElement);

    const pointsDisplay = document.createElement("div");
    pointsDisplay.className = "col-md-3 resonator-points-display text-md-start";
    pointsDisplay.innerHTML = "<small>Points: 0</small>"; // Will be updated by updateTotalBoxScore

    resonatorRow.appendChild(nameLabel);
    resonatorRow.appendChild(selectDiv);
    resonatorRow.appendChild(pointsDisplay);

    elements.limitedResonatorsList.appendChild(resonatorRow);
  });

  updateTotalBoxScore();

  if (elements.submitBoxScoreBtn) {
    elements.submitBoxScoreBtn.disabled = false;
    elements.submitBoxScoreBtn.innerHTML =
      '<i class="bi bi-check-circle-fill me-2"></i>Submit Score & Proceed';
  }
}
