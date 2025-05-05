
/**
 * This file contains utility functions for encryption and decryption using WebCrypto API.
 * It implements AES-GCM encryption with proper IV handling and key derivation.
 */

// Use a constant salt for PBKDF2 (in a production app, this should be unique per app)
const SALT = new Uint8Array([
  132, 42, 53, 84, 235, 224, 155, 118, 
  97, 255, 216, 143, 111, 88, 232, 30
]);

// Number of PBKDF2 iterations (higher is more secure but slower)
const ITERATIONS = 100000;

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
 * Derive a cryptographic key from a password/passphrase
 * @param password The password or passphrase to derive the key from
 * @returns Promise resolving to a CryptoKey
 */
const deriveKey = async (password: string): Promise<CryptoKey> => {
  try {
    // Convert password to buffer
    const passwordBuffer = new TextEncoder().encode(password);
    
    // Import the password as a key
    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      passwordBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    // Derive a key using PBKDF2
    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: SALT,
        iterations: ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    console.error('Key derivation failed:', error);
    throw new Error('Failed to derive encryption key');
  }
};

/**
 * Encrypt a message using AES-GCM with the WebCrypto API
 * @param message The message to encrypt
 * @param password The password/key to use for encryption
 * @returns Promise resolving to the encrypted message (Base64 string with IV prepended)
 */
export const encryptMessage = async (message: string, password: string): Promise<string> => {
  try {
    if (!message || !password) {
      console.error("Cannot encrypt: missing message or password");
      return message;
    }
    
    console.log(`Encrypting message of length ${message.length} with password`);
    
    // Derive key from password
    const key = await deriveKey(password);
    
    // Generate a random IV
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    // Convert message to buffer
    const messageBuffer = new TextEncoder().encode(message);
    
    // Encrypt the message
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      messageBuffer
    );
    
    // Combine IV and encrypted data into one buffer
    const combinedBuffer = new Uint8Array(iv.length + encryptedBuffer.byteLength);
    combinedBuffer.set(iv, 0);
    combinedBuffer.set(new Uint8Array(encryptedBuffer), iv.length);
    
    // Convert to Base64
    const base64Encoded = btoa(String.fromCharCode(...new Uint8Array(combinedBuffer)));
    
    console.log(`Encryption complete. Original length: ${message.length}, Encrypted length: ${base64Encoded.length}`);
    
    return base64Encoded;
  } catch (error) {
    console.error('Encryption failed:', error);
    // Return a special error marker that we can detect
    return `ERROR_ENCRYPTING_${Date.now()}`;
  }
};

/**
 * Check if a string is likely base64 encoded
 */
export const isBase64 = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  
  try {
    // Check if it matches base64 pattern and is reasonably long
    return /^[A-Za-z0-9+/=]+$/.test(str) && str.length > 12;
  } catch (e) {
    return false;
  }
};

/**
 * Check if an encrypted message has our error marker
 */
const hasEncryptionError = (message: string): boolean => {
  return message.startsWith('ERROR_ENCRYPTING_');
};

/**
 * Helper to determine if a message needs decryption
 */
export const needsDecryption = (message: string): boolean => {
  if (!message) return false;
  
  // Skip error markers
  if (hasEncryptionError(message)) return false;
  
  // Check if the message looks like base64 encoded
  return isBase64(message);
};

/**
 * Decrypt a message using AES-GCM with the WebCrypto API
 * @param encryptedMessage The encrypted message (Base64 string with IV prepended)
 * @param password The password/key used for encryption
 * @returns Promise resolving to the decrypted message
 */
export const decryptMessage = async (encryptedMessage: string, password: string): Promise<string> => {
  try {
    if (!encryptedMessage || !password) {
      console.error("Cannot decrypt: missing message or password");
      return encryptedMessage;
    }
    
    // Skip decryption if the message is an error marker
    if (hasEncryptionError(encryptedMessage)) {
      return "[Encryption failed when this message was sent]";
    }
    
    // Skip decryption if the message doesn't appear to be encrypted
    if (!needsDecryption(encryptedMessage)) {
      console.warn("Message doesn't appear to be encrypted, returning as is");
      return encryptedMessage;
    }
    
    console.log(`Attempting to decrypt message of length ${encryptedMessage.length} with password length ${password.length}`);
    
    try {
      // Derive key from password
      const key = await deriveKey(password);
      
      // Convert base64 to buffer
      const buffer = Uint8Array.from(atob(encryptedMessage), c => c.charCodeAt(0));
      
      // Extract IV (first 12 bytes)
      const iv = buffer.slice(0, 12);
      
      // Extract ciphertext (everything after IV)
      const ciphertext = buffer.slice(12);
      
      // Decrypt the message
      const decryptedBuffer = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv
        },
        key,
        ciphertext
      );
      
      // Convert decrypted buffer to string
      const decryptedText = new TextDecoder().decode(decryptedBuffer);
      
      console.log(`Decryption successful. Encrypted length: ${encryptedMessage.length}, Decrypted length: ${decryptedText.length}`);
      
      return decryptedText;
    } catch (e) {
      console.error('Decryption failed:', e);
      return `[Decryption failed: Incorrect key or corrupted message]`;
    }
  } catch (e) {
    console.error('Decryption process error:', e);
    return `[Decryption failed: ${e.message}]`;
  }
};

// Backward compatibility function that works with both old and new encryption
export const decryptMessageCompat = async (encryptedMessage: string, key: string): Promise<string> => {
  // First try new WebCrypto decryption
  try {
    const result = await decryptMessage(encryptedMessage, key);
    
    // If we got a decryption error but it might be an old format message, try the old decryption
    if (result.includes("[Decryption failed:")) {
      console.log("Modern decryption failed, trying legacy decryption...");
      return legacyDecryptMessage(encryptedMessage, key);
    }
    
    return result;
  } catch (error) {
    console.error("Modern decryption error, falling back to legacy:", error);
    return legacyDecryptMessage(encryptedMessage, key);
  }
};

// Legacy decryption function (keep for backwards compatibility)
export const legacyDecryptMessage = (encryptedMessage: string, key: string): string => {
  try {
    if (!encryptedMessage || !key) {
      return encryptedMessage;
    }
    
    console.log(`Attempting legacy decryption of message length ${encryptedMessage.length} with key ${key}`);
    
    // Simple check to see if the message looks like base64 encoded
    if (!isBase64(encryptedMessage)) {
      return encryptedMessage;
    }
    
    try {
      const encrypted = atob(encryptedMessage);
      
      // Legacy XOR decryption
      const decrypted = encrypted
        .split('')
        .map((char, i) => 
          String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
        )
        .join('');
      
      console.log(`Legacy decryption result length: ${decrypted.length}`);
      
      // Check if the result seems like valid text (contains spaces, reasonable char codes)
      const isLikelyValidText = /[\s]/.test(decrypted) && 
        !decrypted.split('').some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) > 126);
      
      if (!isLikelyValidText) {
        console.warn("Legacy decryption output doesn't look like valid text");
        return `[Could not decrypt message - incorrect key]`;
      }
      
      return decrypted;
    } catch (e) {
      console.error('Legacy decryption failed:', e);
      return `[Decryption failed: Invalid format]`;
    }
  } catch (e) {
    console.error('Legacy decryption process error:', e);
    return `[Decryption failed: ${e.message}]`;
  }
};

// Backward compatibility function that works with both old and new encryption
export const encryptMessageCompat = async (message: string, key: string): Promise<string> => {
  // Use the new WebCrypto encryption
  try {
    return await encryptMessage(message, key);
  } catch (error) {
    console.error("Modern encryption error, falling back to legacy:", error);
    return legacyEncryptMessage(message, key);
  }
};

// Legacy encryption function (keep for backwards compatibility)
export const legacyEncryptMessage = (message: string, key: string): string => {
  try {
    if (!message || !key) {
      return message;
    }
    
    // XOR encryption
    const encrypted = message
      .split('')
      .map((char, i) => 
        String.fromCharCode(char.charCodeAt(0) ^ key.charCodeAt(i % key.length))
      )
      .join('');
    
    return btoa(encrypted);
  } catch (e) {
    console.error('Legacy encryption failed:', e);
    return message;
  }
};
