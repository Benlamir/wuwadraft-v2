// frontend/js/uiViews.js
import { elements } from "./uiElements.js";
import * as state from "./state.js"; // Use state variables

// --- Screen Navigation ---
export function showScreen(screenIdToShow) {
  if (!elements.screensNodeList) {
    console.error("Screens NodeList not initialized yet in uiViews!");
    return;
  }
  console.log(`UI: Navigating to screen: ${screenIdToShow}`);
  elements.screensNodeList.forEach((screen) => {
    if (screen) screen.classList.remove("active");
  });
  const screenToShow = document.getElementById(screenIdToShow); // Get element directly here
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

// Add other UI specific functions here (e.g., renderCharacterGrid later)
