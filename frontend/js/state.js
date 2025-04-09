// frontend/js/state.js

// Using 'let' so they can be reassigned
export let currentLobbyId = null;
export let isCurrentUserHost = false;
export let currentUserName = null;
export let myAssignedSlot = null; // 'P1' or 'P2'

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

export function clearLobbyState() {
  console.log("State: Clearing lobby state");
  currentLobbyId = null;
  isCurrentUserHost = false;
  myAssignedSlot = null;
  // Keep currentUserName? Or clear it too? Let's keep it for now.
}

// Optional: Getters if needed, though direct import works for 'let'
// export function getLobbyId() { return currentLobbyId; }
// export function isHost() { return isCurrentUserHost; }
// export function getUserName() { return currentUserName; }
// export function getSlot() { return myAssignedSlot; }
