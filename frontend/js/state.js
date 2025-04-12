// frontend/js/state.js

// Using 'let' so they can be reassigned
export let currentLobbyId = null;
export let isCurrentUserHost = false;
export let currentUserName = null;
export let myAssignedSlot = null; // 'P1' or 'P2'

// --- ADD NEW STATE VARIABLES BELOW THIS LINE ---
export let currentPhase = null; // e.g., 'BAN1', 'PICK1'
export let currentTurn = null; // e.g., 'P1', 'P2'
// --- END ADD ---

// Functions to update state
export function setLobbyInfo(lobbyId, isHost) {
  console.log(`State: Setting lobbyId=${lobbyId}, isHost=${isHost}`);
  currentLobbyId = lobbyId;
  isCurrentUserHost = isHost;
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
  if (phase !== currentPhase) {
    // Optional: Only log if changed
    console.log(`State: Setting currentPhase=${phase}`);
    currentPhase = phase;
  } else {
    currentPhase = phase; // Ensure state is always current even if not logging
  }
}

export function setDraftTurn(turn) {
  if (turn !== currentTurn) {
    // Optional: Only log if changed
    console.log(`State: Setting currentTurn=${turn}`);
    currentTurn = turn;
  } else {
    currentTurn = turn; // Ensure state is always current even if not logging
  }
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
  // --- END MODIFY ---

  // Keep currentUserName? Or clear it too? Let's keep it for now.
}

// Optional: Getters if needed, though direct import works for 'let'
// export function getLobbyId() { return currentLobbyId; }
// export function isHost() { return isCurrentUserHost; }
// export function getUserName() { return currentUserName; }
// export function getSlot() { return myAssignedSlot; }
