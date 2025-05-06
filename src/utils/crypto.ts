
/**
 * This file contains utility functions for encryption and decryption using WebCrypto API.
 * It uses an automatic encryption approach that doesn't require users to manually manage keys.
 */

// We'll use the room ID as the basis for encryption
const ENCRYPTION_SALT = new Uint8Array([
  91, 132, 215, 37, 205, 84, 111, 233, 
  17, 167, 239, 44, 86, 212, 139, 50
]);

// Number of PBKDF2 iterations (higher is more secure but slower)
const ITERATIONS = 100000;

/**
 * Generate a random ID string
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
 * Automatically derive a cryptographic key from room ID and password
 * This creates a deterministic key that all room participants will have access to
 */
const deriveRoomKey = async (roomId: string, roomPassword: string): Promise<CryptoKey> => {
  try {
    // Combine roomId and password to create a strong, unique derivation source
    const keyMaterial = `${roomId}:${roomPassword}:secure-chat-v1`;
    const keyBuffer = new TextEncoder().encode(keyMaterial);
    
    // Import the combined string as a key
    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      keyBuffer,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    
    // Derive a key using PBKDF2
    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: ENCRYPTION_SALT,
        iterations: ITERATIONS,
        hash: 'SHA-256'
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  } catch (error) {
    console.error('Automatic key derivation failed:', error);
    throw new Error('Failed to create encryption key');
  }
};

/**
 * Check if a string appears to be encrypted
 */
export const isEncrypted = (text: string): boolean => {
  if (!text || typeof text !== 'string' || text.length < 20) {
    return false;
  }
  
  try {
    // Check for the prefix we add to all encrypted messages
    return text.startsWith('ENC:');
  } catch (e) {
    return false;
  }
};

/**
 * Encrypt a message automatically based on room information
 */
export const encryptMessage = async (
  message: string, 
  roomId: string, 
  roomPassword: string
): Promise<string> => {
  try {
    if (!message || !roomId || !roomPassword) {
      console.error("Cannot encrypt: missing message or room information");
      return message; 
    }
    
    console.log(`Auto-encrypting message of length ${message.length}`);
    
    // Derive encryption key from room ID and password
    const key = await deriveRoomKey(roomId, roomPassword);
    
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
    
    // Convert to Base64 and add prefix
    const base64Encoded = btoa(String.fromCharCode(...new Uint8Array(combinedBuffer)));
    const encryptedMessage = `ENC:${base64Encoded}`;
    
    console.log(`Auto-encryption complete. Original length: ${message.length}, Encrypted length: ${encryptedMessage.length}`);
    
    return encryptedMessage;
  } catch (error) {
    console.error('Auto-encryption failed:', error);
    return `ERROR:${message}`; 
  }
};

/**
 * Decrypt a message automatically based on room information
 */
export const decryptMessage = async (
  encryptedMessage: string, 
  roomId: string, 
  roomPassword: string
): Promise<string> => {
  try {
    // If it's not encrypted or doesn't have our prefix, return as is
    if (!encryptedMessage || !encryptedMessage.startsWith('ENC:')) {
      return encryptedMessage;
    }
    
    if (!roomId || !roomPassword) {
      console.error("Cannot decrypt: missing room information");
      return "[Cannot decrypt: missing room information]";
    }
    
    // Remove the prefix
    const base64Content = encryptedMessage.slice(4);
    
    try {
      // Derive encryption key from room ID and password
      const key = await deriveRoomKey(roomId, roomPassword);
      
      // Convert base64 to buffer
      const combinedBuffer = Uint8Array.from(atob(base64Content), c => c.charCodeAt(0));
      
      // Extract IV (first 12 bytes)
      const iv = combinedBuffer.slice(0, 12);
      
      // Extract ciphertext (everything after IV)
      const ciphertext = combinedBuffer.slice(12);
      
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
      
      console.log(`Auto-decryption successful. Decrypted length: ${decryptedText.length}`);
      
      return decryptedText;
    } catch (e) {
      console.error('Auto-decryption failed:', e);
      return "[Could not decrypt message]";
    }
  } catch (e) {
    console.error('Auto-decryption error:', e);
    return "[Error during decryption]";
  }
};

