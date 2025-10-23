import * as admin from "firebase-admin";
// Do this once: Initialize the Admin SDK
admin.initializeApp();

// Import and re-export the function you defined in the separate file
// The scheduleDailyPuzzle function was missing; define an inline stub so the module exists.
import { dailyPuzzleScheduler } from "./schedulePuzzle";

export { dailyPuzzleScheduler };
// If you had other functions (e.g., HTTP functions):
// export { yourHttpFunction } from "./httpFunctions";