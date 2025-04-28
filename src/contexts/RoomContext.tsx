
import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from './UserContext';
import { generateRandomId } from '../utils/crypto';
import { supabase } from '../integrations/supabase/client';
import { useToast } from '../hooks/use-toast';
import { encryptMessage, decryptMessage } from '../utils/crypto';

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
  password: string;
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
  createRoom: (name: string, adminId: string, adminName: string) => Promise<Room>;
  joinRoom: (roomId: string, password: string, user: User) => Promise<boolean>;
  leaveRoom: () => void;
  sendMessage: (content: string, isSystem?: boolean) => void;
  sendPrivateMessage: (receiverId: string, content: string) => void;
  availableRooms: { id: string; name: string }[];
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

export const RoomProvider = ({ children }: RoomProviderProps) => {
  const [currentRoom, setCurrentRoom] = useState<Room | null>(null);
  const [privateChats, setPrivateChats] = useState<PrivateChat[]>([]);
  const [activePrivateChat, setActivePrivateChat] = useState<string | null>(null);
  const [availableRooms, setAvailableRooms] = useState<{ id: string; name: string }[]>([]);
  const { toast } = useToast();

  // Subscribe to room updates
  useEffect(() => {
    const roomSubscription = supabase
      .channel('public:rooms')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'rooms'
      }, (payload) => {
        console.log('Room change detected:', payload);
        fetchAvailableRooms();
      })
      .subscribe();

    // Initial load of available rooms
    fetchAvailableRooms();

    return () => {
      supabase.removeChannel(roomSubscription);
    };
  }, []);

  // Subscribe to messages when a room is joined
  useEffect(() => {
    if (!currentRoom) return;

    const messageSubscription = supabase
      .channel(`room-messages-${currentRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `room_id=eq.${currentRoom.id}`
      }, (payload) => {
        console.log('New message received:', payload);
        
        if (payload.new) {
          const newMessage: any = payload.new;
          
          // Skip if this is our own message (we've already added it to the UI)
          const userId = sessionStorage.getItem('userId');
          if (newMessage.sender_id === userId) return;
          
          // Convert from database format to our app format
          const message: Message = {
            id: newMessage.id,
            senderId: newMessage.sender_id,
            senderName: newMessage.sender_name,
            content: newMessage.content,
            timestamp: new Date(newMessage.created_at),
            isEncrypted: newMessage.is_encrypted,
            isSystemMessage: newMessage.is_system_message
          };
          
          // Add the message to the current room
          setCurrentRoom(prevRoom => {
            if (!prevRoom) return null;
            return {
              ...prevRoom,
              messages: [...prevRoom.messages, message]
            };
          });
        }
      })
      .subscribe();

    // Subscribe to participants
    const participantSubscription = supabase
      .channel(`room-participants-${currentRoom.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'participants',
        filter: `room_id=eq.${currentRoom.id}`
      }, (payload) => {
        console.log('Participant change detected:', payload);
        
        // Refresh participant list
        if (currentRoom) {
          fetchRoomParticipants(currentRoom.id);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageSubscription);
      supabase.removeChannel(participantSubscription);
    };
  }, [currentRoom?.id]);

  // Fetch available rooms
  const fetchAvailableRooms = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('id, name')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching available rooms:', error);
      return;
    }

    setAvailableRooms(data);
  };

  // Fetch room participants
  const fetchRoomParticipants = async (roomId: string) => {
    const { data, error } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', roomId);

    if (error) {
      console.error('Error fetching room participants:', error);
      return;
    }

    if (!currentRoom) return;

    // Update the participants list
    const participants: User[] = data.map(p => ({
      id: p.user_id,
      name: p.user_name,
      isAdmin: p.is_admin,
      joinedAt: new Date(p.joined_at)
    }));

    setCurrentRoom(prev => {
      if (!prev) return null;
      return { ...prev, participants };
    });
  };

  // Create a new room
  const createRoom = async (name: string, adminId: string, adminName: string): Promise<Room> => {
    const roomId = generateRandomId(16);
    const roomPassword = generateRandomId(8); 
    const encryptionKey = generateRandomId(32);
    
    // Insert the room into Supabase
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .insert({
        id: roomId,
        name: name || `Room-${roomId.slice(0, 6)}`,
        password: roomPassword,
        admin_id: adminId,
      })
      .select()
      .single();
    
    if (roomError) {
      console.error('Error creating room:', roomError);
      toast({
        title: 'Error',
        description: 'Failed to create room. Please try again.',
        variant: 'destructive'
      });
      throw roomError;
    }
    
    // Add the admin as a participant
    const { error: participantError } = await supabase
      .from('participants')
      .insert({
        room_id: roomId,
        user_id: adminId,
        user_name: adminName,
        is_admin: true
      });
    
    if (participantError) {
      console.error('Error adding participant:', participantError);
      toast({
        title: 'Error',
        description: 'Failed to join as admin. Please try again.',
        variant: 'destructive'
      });
      throw participantError;
    }
    
    console.log("Room created:", roomId, "with password:", roomPassword);
    
    // Create room object for the UI
    const newRoom: Room = {
      id: roomId,
      password: roomPassword,
      name: name || `Room-${roomId.slice(0, 6)}`,
      createdAt: new Date(roomData.created_at),
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
    
    // Add to available rooms list
    setAvailableRooms(prev => [...prev, { id: roomId, name: newRoom.name }]);
    
    setCurrentRoom(newRoom);
    return newRoom;
  };

  // Join an existing room
  const joinRoom = async (roomId: string, password: string, user: User): Promise<boolean> => {
    // Debug logs
    console.log("Attempting to join room:", roomId);
    console.log("Provided password:", password);
    
    // Check if room exists and password is correct
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .eq('password', password)
      .single();
    
    if (roomError || !roomData) {
      console.log("Room not found or incorrect password");
      toast({
        title: "Error",
        description: "Invalid room ID or password",
        variant: "destructive"
      });
      return false;
    }
    
    console.log("Room found:", roomData);
    
    // Add user to room participants
    const { error: participantError } = await supabase
      .from('participants')
      .insert({
        room_id: roomId,
        user_id: user.id,
        user_name: user.name
      });
    
    if (participantError) {
      console.error('Error adding participant:', participantError);
      toast({
        title: 'Error',
        description: 'Failed to join room. Please try again.',
        variant: 'destructive'
      });
      return false;
    }
    
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
    
    // Insert the system message
    await supabase
      .from('messages')
      .insert({
        room_id: roomId,
        sender_id: 'system',
        sender_name: 'System',
        content: joinMessage.content,
        is_encrypted: false,
        is_system_message: true
      });
    
    console.log("User joined successfully");
    
    // Fetch all messages for this room
    const { data: messagesData } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    
    // Fetch all participants
    const { data: participantsData } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', roomId);
    
    // Create room object for the UI
    const newRoom: Room = {
      id: roomId,
      password: password,
      name: roomData.name,
      createdAt: new Date(roomData.created_at),
      admin: roomData.admin_id,
      participants: participantsData?.map(p => ({
        id: p.user_id,
        name: p.user_name,
        isAdmin: p.is_admin,
        joinedAt: new Date(p.joined_at)
      })) || [],
      messages: messagesData?.map(m => ({
        id: m.id,
        senderId: m.sender_id,
        senderName: m.sender_name,
        content: m.content,
        timestamp: new Date(m.created_at),
        isEncrypted: m.is_encrypted,
        isSystemMessage: m.is_system_message
      })) || [],
      encryptionKey: sessionStorage.getItem(`room_${roomId}_key`) || undefined
    };
    
    // Set current room
    setCurrentRoom(newRoom);
    return true;
  };

  // Leave the current room
  const leaveRoom = async () => {
    if (!currentRoom) return;
    
    const userId = sessionStorage.getItem('userId');
    const userName = sessionStorage.getItem('userName');
    
    if (!userId || !userName) return;
    
    // Remove user from participants
    await supabase
      .from('participants')
      .delete()
      .eq('room_id', currentRoom.id)
      .eq('user_id', userId);
    
    // Add system message about leaving
    await supabase
      .from('messages')
      .insert({
        room_id: currentRoom.id,
        sender_id: 'system',
        sender_name: 'System',
        content: `${userName} left the room`,
        is_encrypted: false,
        is_system_message: true
      });
    
    // If user is admin, check if we should transfer admin role
    if (currentRoom.admin === userId) {
      const { data: participants } = await supabase
        .from('participants')
        .select('*')
        .eq('room_id', currentRoom.id)
        .order('joined_at', { ascending: true })
        .limit(1);
      
      if (participants && participants.length > 0) {
        // Transfer admin role to the earliest joined participant
        await supabase
          .from('participants')
          .update({ is_admin: true })
          .eq('id', participants[0].id);
        
        await supabase
          .from('rooms')
          .update({ admin_id: participants[0].user_id })
          .eq('id', currentRoom.id);
        
        // Add system message about admin transfer
        await supabase
          .from('messages')
          .insert({
            room_id: currentRoom.id,
            sender_id: 'system',
            sender_name: 'System',
            content: `${userName} left the room. ${participants[0].user_name} is now the admin.`,
            is_encrypted: false,
            is_system_message: true
          });
      } else {
        // No participants left, delete the room
        await supabase
          .from('rooms')
          .delete()
          .eq('id', currentRoom.id);
      }
    }
    
    setCurrentRoom(null);
  };

  // Send a message to the current room
  const sendMessage = async (content: string, isSystem = false) => {
    if (!currentRoom) return;
    
    const userId = sessionStorage.getItem('userId');
    const userName = sessionStorage.getItem('userName');
    
    if (!userId || !userName) return;
    
    // Create message object
    const newMessage: Message = {
      id: generateRandomId(),
      senderId: isSystem ? 'system' : userId,
      senderName: isSystem ? 'System' : userName,
      content,
      timestamp: new Date(),
      isEncrypted: !isSystem && !!currentRoom.encryptionKey,
      isSystemMessage: isSystem
    };
    
    // If encryption is enabled and it's not a system message, encrypt the content
    let finalContent = content;
    if (currentRoom.encryptionKey && !isSystem) {
      finalContent = encryptMessage(content, currentRoom.encryptionKey);
    }
    
    // Add message to Supabase
    await supabase
      .from('messages')
      .insert({
        room_id: currentRoom.id,
        sender_id: newMessage.senderId,
        sender_name: newMessage.senderName,
        content: finalContent,
        is_encrypted: newMessage.isEncrypted,
        is_system_message: isSystem
      });
    
    // Update local state immediately for better UX
    setCurrentRoom(prevRoom => {
      if (!prevRoom) return null;
      return {
        ...prevRoom,
        messages: [...prevRoom.messages, newMessage]
      };
    });
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
    sendPrivateMessage,
    availableRooms
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};
