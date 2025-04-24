import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from './UserContext';
import { generateRandomId } from '../utils/crypto';

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  isEncrypted: boolean;
  isSystemMessage?: boolean;
}

export interface Room {
  id: string;
  password: string;  // Added password field
  name: string;
  createdAt: Date;
  admin: string; // User ID of the admin
  participants: User[];
  messages: Message[];
  encryptionKey?: string;
}

interface PrivateChat {
  id: string;
  participants: [string, string]; // User IDs
  messages: Message[];
}

interface RoomContextType {
  currentRoom: Room | null;
  setCurrentRoom: (room: Room | null) => void;
  privateChats: PrivateChat[];
  setPrivateChats: (chats: PrivateChat[]) => void;
  activePrivateChat: string | null;
  setActivePrivateChat: (chatId: string | null) => void;
  createRoom: (name: string, adminId: string, adminName: string) => Room;
  joinRoom: (roomId: string, password: string, user: User) => boolean;
  leaveRoom: () => void;
  sendMessage: (content: string, isSystem?: boolean) => void;
  sendPrivateMessage: (receiverId: string, content: string) => void;
}

const RoomContext = createContext<RoomContextType | undefined>(undefined);

export const useRoom = () => {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider');
  }
  return context;
};

interface RoomProviderProps {
  children: ReactNode;
}

// Mock storage for rooms (would be replaced by a real database/websocket connection)
const rooms: Record<string, Room> = {};

export const RoomProvider = ({ children }: RoomProviderProps) => {
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [privateChats, setPrivateChats] = useState<PrivateChat[]>([]);
  const [activePrivateChat, setActivePrivateChat] = useState<string | null>(null);

  // Create a new room
  const createRoom = (name: string, adminId: string, adminName: string): Room => {
    const roomId = generateRandomId(16);
    const roomPassword = generateRandomId(8); // Generate a random 8-character password
    const encryptionKey = generateRandomId(32);
    
    const newRoom: Room = {
      id: roomId,
      password: roomPassword,
      name: `Room-${roomId.slice(0, 6)}`, // Auto-generate room name
      createdAt: new Date(),
      admin: adminId,
      participants: [{
        id: adminId,
        name: adminName,
        isAdmin: true,
        joinedAt: new Date()
      }],
      messages: [],
      encryptionKey
    };
    
    rooms[roomId] = newRoom;
    setCurrentRoom(newRoom);
    return newRoom;
  };

  // Join an existing room
  const joinRoom = (roomId: string, password: string, user: User): boolean => {
    const room = rooms[roomId];
    if (!room || room.password !== password) return false;
    
    // Add user to room participants
    room.participants.push({
      ...user,
      joinedAt: new Date()
    });
    
    // Add system message
    const joinMessage: Message = {
      id: generateRandomId(),
      senderId: 'system',
      senderName: 'System',
      content: `${user.name} joined the room`,
      timestamp: new Date(),
      isEncrypted: false,
      isSystemMessage: true
    };
    
    room.messages.push(joinMessage);
    setCurrentRoom({...room});
    return true;
  };

  // Leave the current room
  const leaveRoom = () => {
    if (!currentRoom) return;
    
    const user = currentRoom.participants.find(p => p.id === sessionStorage.getItem('userId'));
    if (!user) return;
    
    // If the leaving user is admin, transfer admin to the second earliest joiner
    if (user.isAdmin && currentRoom.participants.length > 1) {
      // Sort participants by join time
      const sortedParticipants = [...currentRoom.participants]
        .filter(p => p.id !== user.id)
        .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
      
      if (sortedParticipants.length > 0) {
        const newAdmin = sortedParticipants[0];
        currentRoom.admin = newAdmin.id;
        const adminIndex = currentRoom.participants.findIndex(p => p.id === newAdmin.id);
        if (adminIndex !== -1) {
          currentRoom.participants[adminIndex].isAdmin = true;
        }
        
        // Add system message
        const adminChangeMessage: Message = {
          id: generateRandomId(),
          senderId: 'system',
          senderName: 'System',
          content: `${user.name} left the room. ${newAdmin.name} is now the admin.`,
          timestamp: new Date(),
          isEncrypted: false,
          isSystemMessage: true
        };
        currentRoom.messages.push(adminChangeMessage);
      }
    } else {
      // Add system message for regular user leaving
      const leaveMessage: Message = {
        id: generateRandomId(),
        senderId: 'system',
        senderName: 'System',
        content: `${user.name} left the room`,
        timestamp: new Date(),
        isEncrypted: false,
        isSystemMessage: true
      };
      currentRoom.messages.push(leaveMessage);
    }
    
    // Remove the user from the room
    currentRoom.participants = currentRoom.participants.filter(p => p.id !== user.id);
    
    // If no participants left, delete the room
    if (currentRoom.participants.length === 0) {
      delete rooms[currentRoom.id];
    } else {
      rooms[currentRoom.id] = {...currentRoom};
    }
    
    setCurrentRoom(null);
  };

  // Send a message to the current room
  const sendMessage = (content: string, isSystem = false) => {
    if (!currentRoom) return;
    
    const userId = sessionStorage.getItem('userId');
    const userName = sessionStorage.getItem('userName');
    
    if (!userId || !userName) return;
    
    const newMessage: Message = {
      id: generateRandomId(),
      senderId: isSystem ? 'system' : userId,
      senderName: isSystem ? 'System' : userName,
      content,
      timestamp: new Date(),
      isEncrypted: !isSystem,
      isSystemMessage: isSystem
    };
    
    currentRoom.messages.push(newMessage);
    rooms[currentRoom.id] = {...currentRoom};
    setCurrentRoom({...currentRoom});
  };

  // Send a private message
  const sendPrivateMessage = (receiverId: string, content: string) => {
    const userId = sessionStorage.getItem('userId');
    const userName = sessionStorage.getItem('userName');
    
    if (!userId || !userName) return;
    
    // Find if there's an existing private chat
    const chatId = [userId, receiverId].sort().join('-');
    let privateChat = privateChats.find(chat => chat.id === chatId);
    
    // If not, create a new private chat
    if (!privateChat) {
      privateChat = {
        id: chatId,
        participants: [userId, receiverId] as [string, string],
        messages: []
      };
      setPrivateChats([...privateChats, privateChat]);
    }
    
    // Add the message
    const newMessage: Message = {
      id: generateRandomId(),
      senderId: userId,
      senderName: userName,
      content,
      timestamp: new Date(),
      isEncrypted: true
    };
    
    privateChat.messages.push(newMessage);
    setPrivateChats(privateChats.map(chat => 
      chat.id === chatId ? {...chat, messages: [...chat.messages, newMessage]} : chat
    ));
    setActivePrivateChat(chatId);
  };

  const value = {
    currentRoom,
    setCurrentRoom,
    privateChats,
    setPrivateChats,
    activePrivateChat,
    setActivePrivateChat,
    createRoom,
    joinRoom,
    leaveRoom,
    sendMessage,
    sendPrivateMessage
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};
