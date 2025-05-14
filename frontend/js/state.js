// frontend/js/state.js

// Using 'let' so they can be reassigned
export let currentLobbyId = null;
export let isCurrentUserHost = false;
export let currentUserName = null;
export let myAssignedSlot = null; // 'P1' or 'P2'

// --- ADD NEW STATE VARIABLES BELOW THIS LINE ---
export let currentPhase = null; // e.g., 'BAN1', 'PICK1'
export let currentTurn = null; // e.g., 'P1', 'P2'
export let activeElementFilter = "All"; // Track the active element filter ('All', 'Aero', etc.)
export let currentDraftState = null; // Store the latest full draft state object
export let currentTurnExpiresAt = null; // Holds the ISO timestamp string or null
export let timerIntervalId = null; // Holds the ID returned by setInterval
export let equilibrationEnabledForLobby = false;
export let localPlayerHasSubmittedScore = false;
// --- END ADD ---

// Functions to update state
export function setLobbyInfo(lobbyId, isHost, slot) {
  console.log(
    `State: Setting lobbyId=${lobbyId}, isHost=${isHost}, slot=${slot}`
  );
  currentLobbyId = lobbyId;
  isCurrentUserHost = isHost;
  myAssignedSlot = slot;
}

export function setUserName(name) {
  console.log(`State: Setting userName=${name}`);
  currentUserName = name;
}

export function setAssignedSlot(slot) {
  console.log(`State: Setting assignedSlot=${slot}`);
  myAssignedSlot = slot;
}

// --- ADD NEW UPDATE FUNCTIONS BELOW THIS LINE ---
export function setDraftPhase(phase) {
  const changed = phase !== currentPhase;
  currentPhase = phase; // Assignment
  console.log(`State: currentPhase is now: ${currentPhase}`);
  if (changed) {
    console.log(`State: Setting currentPhase=${phase}`);
  }
}

export function setDraftTurn(turn) {
  const changed = turn !== currentTurn;
  currentTurn = turn; // Assignment
  console.log(`State: currentTurn is now: ${currentTurn}`);
  if (changed) {
    console.log(`State: Setting currentTurn=${turn}`);
  }
}

export function setActiveElementFilter(filter) {
  activeElementFilter = filter;
  console.log(`State: Active filter set to ${filter}`);
}

export function setCurrentDraftState(newState) {
  // Store the entire message object which represents the draft state
  currentDraftState = newState;
  console.log("State: Stored latest draft state", currentDraftState);
}

export function setTurnExpiry(isoTimestamp) {
  // --- ADD LOG ---
  console.log(
    `State DEBUG: Setting currentTurnExpiresAt to: ${isoTimestamp} (Type: ${typeof isoTimestamp})`
  );
  // --- END ADD ---
  if (currentTurnExpiresAt !== isoTimestamp) {
    currentTurnExpiresAt = isoTimestamp;
  } else {
    currentTurnExpiresAt = isoTimestamp;
  }
}
// --- END ADD ---

export function clearLobbyState() {
  console.log("State: Clearing all lobby state");
  currentLobbyId = null;
  isCurrentUserHost = false;
  myAssignedSlot = null;
  clearDraftState();
  equilibrationEnabledForLobby = false;
  localPlayerHasSubmittedScore = false;
  // Keep currentUserName for convenience
}

// New function to clear only draft-related state
export function clearDraftState() {
  console.log("State: Clearing draft-specific state");
  currentPhase = null;
  currentTurn = null;
  activeElementFilter = "All"; // Reset filter
  currentDraftState = null; // Clear stored state
  currentTurnExpiresAt = null; // Clear expiry
  if (timerIntervalId) {
    // Clear any active timer interval
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
}

// --- NEW FUNCTION ---
// Function to set the timer interval ID from other modules
export function setTimerIntervalId(newId) {
  console.log(`State DEBUG: Setting timerIntervalId to: ${newId}`);
  timerIntervalId = newId; // Update the internal variable
}
// --- END NEW FUNCTION ---

// --- MODIFIED FUNCTION ---
// Modify clearTimerInterval to also nullify the state variable
export function clearTimerInterval() {
  if (timerIntervalId !== null) {
    const idToClear = timerIntervalId; // Store temporarily for logging
    console.log(
      `STATE DEBUG: Clearing interval ID: ${idToClear} via clearInterval.`
    );
    clearInterval(idToClear);
    timerIntervalId = null; // Set to null internally
    console.log(`STATE DEBUG: timerIntervalId set to null.`);
  } else {
    console.log(
      "STATE DEBUG: clearTimerInterval called, but no active interval ID found in state."
    );
  }
}
// --- END MODIFIED FUNCTION ---

// Add setter functions for equilibration state
export function setEquilibrationEnabledForLobby(isEnabled) {
  equilibrationEnabledForLobby = isEnabled;
  console.log(`State: equilibrationEnabledForLobby set to ${isEnabled}`);
}

export function setLocalPlayerHasSubmittedScore(hasSubmitted) {
  localPlayerHasSubmittedScore = hasSubmitted;
  console.log(`State: localPlayerHasSubmittedScore set to ${hasSubmitted}`);
}

// Optional: Getters if needed, though direct import works for 'let'
// export function getLobbyId() { return currentLobbyId; }
// export function isHost() { return isCurrentUserHost; }
// export function getUserName() { return currentUserName; }
// export function getSlot() { return myAssignedSlot; }
