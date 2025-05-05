
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
    console.log(`Encryption key saved successfully for room ${roomId}`);
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
 * Derive a cryptographic key from a password/passphrase using PBKDF2
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
      throw new Error("Missing message or password for encryption");
    }
    
    console.log(`Encrypting message of length ${message.length}`);
    
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
    
    console.log(`Encryption complete. Encrypted length: ${base64Encoded.length}`);
    
    return base64Encoded;
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error(`Encryption failed: ${error.message}`);
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
 * Helper to determine if a message needs decryption
 */
export const needsDecryption = (message: string): boolean => {
  if (!message) return false;
  
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
      throw new Error("Missing encrypted message or password for decryption");
    }
    
    // Skip decryption if the message doesn't appear to be encrypted
    if (!needsDecryption(encryptedMessage)) {
      console.warn("Message doesn't appear to be encrypted, returning as is");
      return encryptedMessage;
    }
    
    console.log(`Attempting to decrypt message of length ${encryptedMessage.length}`);
    
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
      
      console.log(`Decryption successful. Decrypted length: ${decryptedText.length}`);
      
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

// For backward compatibility - we'll preserve these functions but make them use the new implementation
export const encryptMessageCompat = async (message: string, key: string): Promise<string> => {
  return await encryptMessage(message, key);
};

export const decryptMessageCompat = async (encryptedMessage: string, key: string): Promise<string> => {
  return await decryptMessage(encryptedMessage, key);
};
