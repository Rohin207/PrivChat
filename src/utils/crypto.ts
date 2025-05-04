
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
    
    const keyName = `room_${roomId}_key`;
    sessionStorage.setItem(keyName, key);
    console.log(`Encryption key saved successfully for room ${roomId} with key name ${keyName}`);
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
    
    const keyName = `room_${roomId}_key`;
    const key = sessionStorage.getItem(keyName);
    console.log(`Retrieved encryption key for room ${roomId} with key name ${keyName}: ${key ? "Key found" : "No key found"}`);
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
  try {
    if (!message || !key) {
      console.error("Cannot encrypt: missing message or key");
      return message;
    }
    
    console.log(`Encrypting message of length ${message.length} with key ${key}`);
    
    // For real encryption, use the Web Crypto API
    const encrypted = message
      .split('')
      .map((char, i) => 
        String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
      )
      .join('');
    
    const base64Encoded = btoa(encrypted);
    console.log(`Encryption complete. Original length: ${message.length}, Encrypted length: ${base64Encoded.length}`);
    
    return base64Encoded;
  } catch (e) {
    console.error('Encryption failed:', e);
    return message;
  }
};

/**
 * Check if a string is likely base64 encoded
 */
export const isBase64 = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  
  try {
    // Check if it matches base64 pattern
    return /^[A-Za-z0-9+/=]+$/.test(str) && str.length % 4 === 0;
  } catch (e) {
    return false;
  }
};

/**
 * Helper to determine if a message needs decryption
 */
export const needsDecryption = (message: string): boolean => {
  if (!message) return false;
  
  // A simple check to see if the message looks like base64 encoded
  return isBase64(message);
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
    
    console.log(`Attempting to decrypt message of length ${encryptedMessage.length} with key ${key}`);
    
    // Skip decryption if the message doesn't appear to be encrypted
    if (!needsDecryption(encryptedMessage)) {
      console.warn("Message doesn't appear to be encrypted, returning as is");
      return encryptedMessage;
    }
    
    try {
      const encrypted = atob(encryptedMessage);
      
      const decrypted = encrypted
        .split('')
        .map((char, i) => 
          String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
        )
        .join('');
      
      console.log(`Decryption successful. Encrypted length: ${encryptedMessage.length}, Decrypted length: ${decrypted.length}`);
      return decrypted;
    } catch (e) {
      console.error('Base64 decoding failed:', e);
      return `[Decryption failed: Invalid base64]`;
    }
  } catch (e) {
    console.error('Decryption failed:', e);
    return `[Decryption failed: ${e.message}]`;
  }
};
