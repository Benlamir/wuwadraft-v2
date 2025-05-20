/**
 * Player color management for the UI
 * This file provides access to player colors both as static constants
 * and through CSS variables for dynamic theming
 */

/**
 * Get player colors from CSS variables
 * @returns {Object} Object containing player colors
 */
export function getPlayerColors() {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    
    return {
      p1: {
        main: style.getPropertyValue('--p1-color').trim(),
        light: style.getPropertyValue('--p1-color-light').trim(),
        text: style.getPropertyValue('--p1-color-text').trim()
      },
      p2: {
        main: style.getPropertyValue('--p2-color').trim(),
        light: style.getPropertyValue('--p2-color-light').trim(),
        text: style.getPropertyValue('--p2-color-text').trim()
      }
    };
  } 