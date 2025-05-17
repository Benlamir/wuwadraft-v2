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
export let hasPopulatedBoxScoreScreenThisTurn = false; // Track if BSS has been populated this session

// Add new state variables for draft picks and resonators
export let player1Picks = [];
export let player2Picks = [];
export let availableResonators = [];
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
  const previousPhase = currentPhase;
  currentPhase = phase;
  console.log(
    `STATE_JS_DEBUG: Global state.currentPhase changed from '${previousPhase}' to '${currentPhase}'`
  );
}

export function setDraftTurn(turn) {
  const previousTurn = currentTurn;
  currentTurn = turn;
  console.log(
    `STATE_JS_DEBUG: Global state.currentTurn changed from '${previousTurn}' to '${currentTurn}'`
  );
}

export function setActiveElementFilter(filter) {
  console.log(
    `STATE_JS_DEBUG: Setting activeElementFilter from ${activeElementFilter} to ${filter}`
  );
  activeElementFilter = filter;
  console.log(`State: Active filter set to ${filter}`);
}

export function setCurrentDraftState(newState) {
  console.log(
    `STATE_JS_DEBUG: Updating currentDraftState from:`,
    currentDraftState
  );
  console.log(`STATE_JS_DEBUG: To new state:`, newState);
  currentDraftState = newState;
  console.log("State: Stored latest draft state", currentDraftState);
}

export function setTurnExpiry(isoTimestamp) {
  console.log(
    `STATE_JS_DEBUG: Setting currentTurnExpiresAt from ${currentTurnExpiresAt} to ${isoTimestamp}`
  );
  if (currentTurnExpiresAt !== isoTimestamp) {
    currentTurnExpiresAt = isoTimestamp;
  } else {
    currentTurnExpiresAt = isoTimestamp;
  }
}

export function setPlayer1Picks(picks) {
  console.log(`STATE_JS_DEBUG: Setting player1Picks from:`, player1Picks);
  console.log(`STATE_JS_DEBUG: To new picks:`, picks);
  console.log(`STATE_JS_DEBUG: Picks update triggered by lobbyStateUpdate`);
  player1Picks = picks;
  console.log(
    `STATE_JS_DEBUG: Player 1 Picks updated to: ${JSON.stringify(player1Picks)}`
  );
}

export function setPlayer2Picks(picks) {
  console.log(`STATE_JS_DEBUG: Setting player2Picks from:`, player2Picks);
  console.log(`STATE_JS_DEBUG: To new picks:`, picks);
  console.log(`STATE_JS_DEBUG: Picks update triggered by lobbyStateUpdate`);
  player2Picks = picks;
  console.log(
    `STATE_JS_DEBUG: Player 2 Picks updated to: ${JSON.stringify(player2Picks)}`
  );
}

export function setAvailableResonators(resonators) {
  console.log(
    `STATE_JS_DEBUG: Setting availableResonators from:`,
    availableResonators
  );
  console.log(`STATE_JS_DEBUG: To new resonators:`, resonators);
  console.log(
    `STATE_JS_DEBUG: Resonators update triggered by lobbyStateUpdate`
  );
  availableResonators = resonators;
  console.log(
    `STATE_JS_DEBUG: Available Resonators updated to: ${JSON.stringify(
      availableResonators
    )}`
  );
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
  hasPopulatedBoxScoreScreenThisTurn = false; // Reset the BSS population flag
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
  hasPopulatedBoxScoreScreenThisTurn = false; // Reset the BSS population flag
  player1Picks = []; // Clear player picks
  player2Picks = []; // Clear player picks
  availableResonators = []; // Clear available resonators
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

// Add setter function for BSS population flag
export function setHasPopulatedBoxScoreScreenThisTurn(populated) {
  hasPopulatedBoxScoreScreenThisTurn = populated;
  console.log(`State: hasPopulatedBoxScoreScreenThisTurn set to ${populated}`);
}

// Optional: Getters if needed, though direct import works for 'let'
// export function getLobbyId() { return currentLobbyId; }
// export function isHost() { return isCurrentUserHost; }
// export function getUserName() { return currentUserName; }
// export function getSlot() { return myAssignedSlot; }
