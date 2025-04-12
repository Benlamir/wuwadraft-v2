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
// --- END ADD ---

export function clearLobbyState() {
  console.log("State: Clearing lobby state");
  currentLobbyId = null;
  isCurrentUserHost = false;
  myAssignedSlot = null;

  // --- MODIFY clearLobbyState TO INCLUDE THESE LINES ---
  currentPhase = null;
  currentTurn = null;
  activeElementFilter = "All"; // Reset filter
  currentDraftState = null; // Clear stored state
  // --- END MODIFY ---

  // Keep currentUserName? Or clear it too? Let's keep it for now.
}

// Optional: Getters if needed, though direct import works for 'let'
// export function getLobbyId() { return currentLobbyId; }
// export function isHost() { return isCurrentUserHost; }
// export function getUserName() { return currentUserName; }
// export function getSlot() { return myAssignedSlot; }
