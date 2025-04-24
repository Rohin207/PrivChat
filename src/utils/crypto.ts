
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
 * Simple encryption function (For demo purposes only - not secure)
 * In a real application, use a proper end-to-end encryption library
 */
export const encryptMessage = (message: string, key: string): string => {
  // In a real app, use WebCrypto API with proper encryption
  // This is just a simple XOR for demonstration
  try {
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
