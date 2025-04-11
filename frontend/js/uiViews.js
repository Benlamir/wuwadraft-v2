// frontend/js/uiViews.js
import { elements } from "./uiElements.js";
import * as state from "./state.js"; // Use state variables
import { ALL_RESONATORS_DATA } from "./resonatorData.js";

// --- Screen Navigation ---
export function showScreen(screenIdToShow) {
  if (!elements.screensNodeList) {
    console.error("Screens NodeList not initialized yet in uiViews!");
    return;
  }
  console.log(`UI: Navigating to screen: ${screenIdToShow}`);

  // Handle header visibility
  if (elements.header) {
    if (screenIdToShow === "draft-screen") {
      console.log("UI: Hiding header for draft screen.");
      elements.header.classList.add("visually-hidden");
    } else {
      console.log("UI: Showing header for non-draft screen.");
      elements.header.classList.remove("visually-hidden");
    }
  } else {
    console.warn("UI: Header element not found, cannot toggle visibility.");
  }

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

export function updateDraftScreenUI(draftState) {
  console.log("UI: Updating draft screen UI with state:", draftState);
  // Ensure elements object and draftScreen element itself are available
  if (!elements || !elements.draftScreen) {
    console.error(
      "UI Update Error: elements object or draftScreen element not initialized!"
    );
    return;
  }

  // --- Update Phase and Turn Status ---
  if (elements.draftPhaseStatus) {
    const turnPlayerName =
      draftState.currentTurn === "P1"
        ? draftState.player1Name || "Player 1"
        : draftState.player2Name || "Player 2";
    elements.draftPhaseStatus.textContent = `Phase: ${
      draftState.currentPhase || "N/A"
    } (${turnPlayerName}'s Turn)`;
  } else {
    console.warn("UI Update Warning: Draft phase status element not found");
  }

  // --- Update Player Names ---
  if (elements.draftP1Name) {
    elements.draftP1Name.textContent = draftState.player1Name || "[P1 Name]";
  } else {
    console.warn("UI Update Warning: Draft P1 Name element not found");
  }
  if (elements.draftP2Name) {
    elements.draftP2Name.textContent = draftState.player2Name || "[P2 Name]";
  } else {
    console.warn("UI Update Warning: Draft P2 Name element not found");
  }

  // --- Update Timer (Placeholder - Check if element exists first) ---
  // if (elements.draftTimer) {
  //      // elements.draftTimer.textContent = ... // Add later when timer logic exists
  // }

  // --- Clear/Update Pick/Ban Lists (Check if elements exist first) ---
  if (elements.draftP1PicksList) {
    elements.draftP1PicksList.innerHTML = ""; // Clear previous picks
    (draftState.player1Picks || []).forEach((pick) => {
      // Loop through picks received from state
      const li = document.createElement("li");
      li.textContent = pick; // Assuming pick is just the name/ID
      elements.draftP1PicksList.appendChild(li);
    });
  } else {
    // console.warn("UI Update Warning: Draft P1 picks list element not found"); // Reduce noise
  }
  if (elements.draftP2PicksList) {
    elements.draftP2PicksList.innerHTML = ""; // Clear previous picks
    (draftState.player2Picks || []).forEach((pick) => {
      const li = document.createElement("li");
      li.textContent = pick;
      elements.draftP2PicksList.appendChild(li);
    });
  } else {
    // console.warn("UI Update Warning: Draft P2 picks list element not found");
  }
  if (elements.draftBansList) {
    elements.draftBansList.innerHTML = ""; // Clear previous bans
    (draftState.bans || []).forEach((ban) => {
      const li = document.createElement("li");
      li.textContent = ban;
      elements.draftBansList.appendChild(li);
    });
  } else {
    // console.warn("UI Update Warning: Draft bans list element not found");
  }

  // --- Render Character Grid ---
  try {
    // Check if renderCharacterGrid exists before calling (should be defined in this file)
    if (typeof renderCharacterGrid === "function") {
      renderCharacterGrid(draftState); // Call the function to draw/update the grid
    } else {
      console.error(
        "renderCharacterGrid function is not defined correctly in uiViews.js."
      );
    }
  } catch (gridError) {
    console.error("Error calling renderCharacterGrid:", gridError);
  }
}

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

function renderCharacterGrid(draftState) {
  if (!elements.characterGridContainer) return; // Exit if container not found

  console.log(
    "UI: Rendering character grid. Available:",
    draftState.availableResonators
  );
  elements.characterGridContainer.innerHTML = ""; // Clear previous grid

  const availableSet = new Set(draftState.availableResonators || []);
  // Combine picks and bans for easy checking (using IDs if available, else names)
  const unavailableSet = new Set([
    ...(draftState.bans || []),
    ...(draftState.player1Picks || []),
    ...(draftState.player2Picks || []),
  ]);
  // TODO: Determine if it's the current player's turn (e.g., check draftState.currentTurn vs state.myAssignedSlot)
  const isMyTurn = false; // Placeholder for turn logic

  ALL_RESONATORS_DATA.forEach((resonator) => {
    const button = document.createElement("button");
    button.classList.add("character-button", "stylish-button"); // Add base classes
    button.dataset.resonatorId = resonator.id; // Store ID or name on button
    button.dataset.resonatorName = resonator.name;

    // Basic content: Image Button
    button.innerHTML = `<img src="${resonator.image_button}" alt="${resonator.name}" title="${resonator.name}" />`;
    // Maybe add name below image later: += `<span class="char-name">${resonator.name}</span>`;

    let isAvailable = availableSet.has(resonator.name); // Check availability based on name (or ID)
    let isUnavailable = unavailableSet.has(resonator.name); // Check if picked/banned

    if (isUnavailable) {
      button.classList.add("unavailable", "picked-banned"); // General unavailable class
      button.disabled = true;
    } else if (!isAvailable) {
      // This case might indicate data inconsistency, treat as unavailable
      button.classList.add("unavailable");
      button.disabled = true;
      console.warn(
        `Resonator ${resonator.name} not in available list but not picked/banned?`
      );
    } else {
      // It's available!
      button.classList.add("available");
      // Only enable if it's this player's turn (implement later)
      button.disabled = !isMyTurn; // Disable if not my turn (placeholder)
      if (isMyTurn) {
        // Add click listener only if it's my turn and available
        // button.addEventListener('click', handleCharacterSelection); // Define this later
      }
    }

    elements.characterGridContainer.appendChild(button);
  });
}

// Add other UI specific functions here (e.g., renderCharacterGrid later)
