import { RESONATOR_DATA_URL } from "./config.js";

// This will now be populated by the fetch function
export let ALL_RESONATORS_DATA = [];

export const SEQUENCE_POINTS = {
  0: 3,  // S0
  1: 5,  // S1
  2: 9,  // S2
  3: 10, // S3
  4: 11, // S4
  5: 12, // S5
  6: 16, // S6
};

// --- NEW ASYNCHRONOUS FUNCTION TO LOAD DATA ---
export async function initializeResonatorData() {
  console.log("DATA: Attempting to load resonator data from S3...");
  try {
    const response = await fetch(RESONATOR_DATA_URL, {
      cache: "no-cache", // Use 'no-cache' to ensure we get updates, or 'default' for standard browser caching
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    ALL_RESONATORS_DATA = data; // Populate the exported variable
    console.log(
      "DATA: Resonator data loaded successfully from S3:",
      ALL_RESONATORS_DATA
    );
  } catch (error) {
    console.error(
      "DATA_ERROR: Failed to load resonator data from S3. Using local fallback data.",
      error
    );
    // Fallback to a hardcoded list if the fetch fails
    ALL_RESONATORS_DATA = [
      // You could paste your original resonator list here as a backup
      // For now, we'll leave it empty or with a minimal set on failure.
      {
        id: "error_fallback",
        name: "Error Loading Data",
        rarity: 1,
        isLimited: false,
        element: [],
        weapon: "",
      },
    ];
    // Optionally alert the user
    alert(
      "Error: Could not load character data from the server. The application may not function correctly."
    );
  }
}
// --- END NEW FUNCTION ---
