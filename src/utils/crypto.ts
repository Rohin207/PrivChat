
/**
 * This file contains utility functions for encryption and decryption.
 * In a real-world application, this should be implemented with a proper
 * end-to-end encryption library and use WebCrypto API securely.
 */

/**
 * Generate a random ID or encryption key
 * @param length Length of the ID (default: 16)
 * @returns Random ID string
 */
export const generateRandomId = (length = 16): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

/**
 * Save room encryption key to session storage
 */
export const saveRoomEncryptionKey = (roomId: string, key: string): boolean => {
  try {
    if (!roomId || !key) {
      console.error("Invalid roomId or key:", { roomId, keyLength: key?.length });
      return false;
    }
    
    sessionStorage.setItem(`room_${roomId}_key`, key);
    console.log("Encryption key saved successfully for room:", roomId);
    return true;
  } catch (error) {
    console.error("Error saving encryption key:", error);
    return false;
  }
};

/**
 * Get room encryption key from session storage
 */
export const getRoomEncryptionKey = (roomId: string): string | null => {
  try {
    if (!roomId) {
      console.error("Invalid roomId when getting encryption key");
      return null;
    }
    
    const key = sessionStorage.getItem(`room_${roomId}_key`);
    console.log("Retrieved encryption key for room:", roomId, key ? "Key found" : "No key found");
    return key;
  } catch (error) {
    console.error("Error getting encryption key:", error);
    return null;
  }
};

/**
 * Prompt user for encryption key
 * Returns the entered key or null if canceled
 */
export const promptForEncryptionKey = (roomId: string): string | null => {
  const keyPrompt = prompt("Please enter the room encryption key provided by the admin:");
  
  if (keyPrompt && keyPrompt.trim() !== '') {
    // Save the key to session storage for future use
    const saved = saveRoomEncryptionKey(roomId, keyPrompt.trim());
    if (saved) {
      return keyPrompt.trim();
    }
  }
  
  return null;
};

/**
 * Simple encryption function (For demo purposes only - not secure)
 * In a real application, use a proper end-to-end encryption library
 */
export const encryptMessage = (message: string, key: string): string => {
  // In a real app, use WebCrypto API with proper encryption
  // This is just a simple XOR for demonstration
  try {
    if (!message || !key) {
      console.error("Cannot encrypt: missing message or key");
      return message;
    }
    
    // For real encryption, use the Web Crypto API
    return btoa(
      message
        .split('')
        .map((char, i) => 
          String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
        )
        .join('')
    );
  } catch (e) {
    console.error('Encryption failed:', e);
    return message;
  }
};

/**
 * Simple decryption function (For demo purposes only - not secure)
 * In a real application, use a proper end-to-end encryption library
 */
export const decryptMessage = (encryptedMessage: string, key: string): string => {
  // In a real app, use WebCrypto API with proper decryption
  try {
    if (!encryptedMessage || !key) {
      console.error("Cannot decrypt: missing message or key");
      return encryptedMessage;
    }
    
    const encrypted = atob(encryptedMessage);
    return encrypted
      .split('')
      .map((char, i) => 
        String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
      )
      .join('');
  } catch (e) {
    console.error('Decryption failed:', e);
    return encryptedMessage;
  }
};

/**
 * Helper to determine if a message needs decryption
 */
export const needsDecryption = (message: string): boolean => {
  // A simple check to see if the message looks like base64 encoded
  try {
    if (!message) return false;
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    return base64Regex.test(message) && message.length % 4 === 0;
  } catch (e) {
    console.error("Error checking if message needs decryption:", e);
    return false;
  }
};
