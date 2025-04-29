
import { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { User } from './UserContext';
import { generateRandomId } from '../utils/crypto';
import { supabase } from '../integrations/supabase/client';
import { useToast } from '../hooks/use-toast';
import { encryptMessage, decryptMessage } from '../utils/crypto';
import { useNavigate } from 'react-router-dom';

export interface Message {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: Date;
  isEncrypted: boolean;
  isSystemMessage?: boolean;
}

export interface JoinRequest {
  id: string;
  userId: string;
  userName: string;
  roomId: string;
  timestamp: Date;
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
  joinRequests?: JoinRequest[];
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
  requestToJoinRoom: (roomId: string, password: string, user: User) => Promise<boolean>;
  approveJoinRequest: (request: JoinRequest) => Promise<boolean>;
  rejectJoinRequest: (request: JoinRequest) => Promise<void>;
  leaveRoom: () => Promise<void>;
  sendMessage: (content: string, isSystem?: boolean) => void;
  sendPrivateMessage: (receiverId: string, content: string) => void;
  availableRooms: { id: string; name: string }[];
  fetchJoinRequests: () => Promise<void>;
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

    // Subscribe to join requests
    const joinRequestSubscription = supabase
      .channel(`join-requests-${currentRoom.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'join_requests',
        filter: `room_id=eq.${currentRoom.id}`
      }, (payload) => {
        console.log('Join request change detected:', payload);
        
        // Refresh join requests if admin
        if (currentRoom && currentRoom.admin === sessionStorage.getItem('userId')) {
          fetchJoinRequests();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(messageSubscription);
      supabase.removeChannel(participantSubscription);
      supabase.removeChannel(joinRequestSubscription);
    };
  }, [currentRoom?.id]);

  // Fetch join requests for current room
  const fetchJoinRequests = async () => {
    if (!currentRoom) return;
    
    // Only admin should fetch join requests
    if (currentRoom.admin !== sessionStorage.getItem('userId')) return;

    const { data, error } = await supabase
      .from('join_requests')
      .select('*')
      .eq('room_id', currentRoom.id);

    if (error) {
      console.error('Error fetching join requests:', error);
      return;
    }

    const joinRequests: JoinRequest[] = data.map(req => ({
      id: req.id,
      userId: req.user_id,
      userName: req.user_name,
      roomId: req.room_id,
      timestamp: new Date(req.created_at)
    }));

    setCurrentRoom(prev => {
      if (!prev) return null;
      return { ...prev, joinRequests };
    });
  };

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
      encryptionKey,
      joinRequests: []
    };
    
    // Add to available rooms list
    setAvailableRooms(prev => [...prev, { id: roomId, name: newRoom.name }]);
    
    setCurrentRoom(newRoom);
    return newRoom;
  };

  // Request to join an existing room
  const requestToJoinRoom = async (roomId: string, password: string, user: User): Promise<boolean> => {
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
    
    // Add join request
    const { error: requestError } = await supabase
      .from('join_requests')
      .insert({
        room_id: roomId,
        user_id: user.id,
        user_name: user.name
      });
    
    if (requestError) {
      console.error('Error adding join request:', requestError);
      toast({
        title: 'Error',
        description: 'Failed to send join request. Please try again.',
        variant: 'destructive'
      });
      return false;
    }
    
    toast({
      title: 'Join request sent',
      description: 'Waiting for admin approval to join the room.',
    });
    
    return true;
  };

  // Approve a join request
  const approveJoinRequest = async (request: JoinRequest): Promise<boolean> => {
    if (!currentRoom || currentRoom.admin !== sessionStorage.getItem('userId')) {
      toast({
        title: 'Error',
        description: 'Only the admin can approve join requests',
        variant: 'destructive'
      });
      return false;
    }
    
    // Add user to room participants
    const { error: participantError } = await supabase
      .from('participants')
      .insert({
        room_id: request.roomId,
        user_id: request.userId,
        user_name: request.userName
      });
    
    if (participantError) {
      console.error('Error adding participant:', participantError);
      toast({
        title: 'Error',
        description: 'Failed to approve request. Please try again.',
        variant: 'destructive'
      });
      return false;
    }
    
    // Add system message
    await supabase
      .from('messages')
      .insert({
        room_id: request.roomId,
        sender_id: 'system',
        sender_name: 'System',
        content: `${request.userName} joined the room`,
        is_encrypted: false,
        is_system_message: true
      });
    
    // Delete the join request
    await supabase
      .from('join_requests')
      .delete()
      .eq('id', request.id);
    
    // Refresh join requests
    await fetchJoinRequests();
    
    toast({
      title: 'Request Approved',
      description: `${request.userName} has been added to the room`,
    });
    
    return true;
  };

  // Reject a join request
  const rejectJoinRequest = async (request: JoinRequest) => {
    if (!currentRoom || currentRoom.admin !== sessionStorage.getItem('userId')) return;
    
    // Delete the join request
    await supabase
      .from('join_requests')
      .delete()
      .eq('id', request.id);
    
    // Refresh join requests
    await fetchJoinRequests();
    
    toast({
      title: 'Request Rejected',
      description: `Join request from ${request.userName} has been rejected`,
    });
  };

  // Join an existing room directly (for backward compatibility)
  const joinRoom = async (roomId: string, password: string, user: User): Promise<boolean> => {
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
    
    // Check if admin or if approval is not required
    if (roomData.admin_id !== user.id) {
      // Request to join instead
      return await requestToJoinRoom(roomId, password, user);
    }
    
    // If user is admin, they can join directly
    const { error: participantError } = await supabase
      .from('participants')
      .insert({
        room_id: roomId,
        user_id: user.id,
        user_name: user.name,
        is_admin: roomData.admin_id === user.id
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
    
    // If admin, fetch join requests
    if (newRoom.admin === user.id) {
      const { data: joinRequestsData } = await supabase
        .from('join_requests')
        .select('*')
        .eq('room_id', roomId);
      
      if (joinRequestsData) {
        newRoom.joinRequests = joinRequestsData.map(req => ({
          id: req.id,
          userId: req.user_id,
          userName: req.user_name,
          roomId: req.room_id,
          timestamp: new Date(req.created_at)
        }));
      }
    }
    
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
    
    // Check participant count
    const { data: participants } = await supabase
      .from('participants')
      .select('*')
      .eq('room_id', currentRoom.id);
    
    // If no participants left, delete the room
    if (!participants || participants.length === 0) {
      console.log("No participants left, deleting room:", currentRoom.id);
      
      // Delete all messages
      await supabase
        .from('messages')
        .delete()
        .eq('room_id', currentRoom.id);
      
      // Delete all join requests
      await supabase
        .from('join_requests')
        .delete()
        .eq('room_id', currentRoom.id);
      
      // Delete the room itself
      await supabase
        .from('rooms')
        .delete()
        .eq('id', currentRoom.id);
      
      // Remove from available rooms list
      setAvailableRooms(prev => prev.filter(room => room.id !== currentRoom.id));
    } 
    // If user is admin, transfer admin role
    else if (currentRoom.admin === userId) {
      // Transfer admin role to the earliest joined participant
      const nextAdmin = participants[0];
      
      await supabase
        .from('participants')
        .update({ is_admin: true })
        .eq('id', nextAdmin.id);
      
      await supabase
        .from('rooms')
        .update({ admin_id: nextAdmin.user_id })
        .eq('id', currentRoom.id);
      
      // Add system message about admin transfer
      await supabase
        .from('messages')
        .insert({
          room_id: currentRoom.id,
          sender_id: 'system',
          sender_name: 'System',
          content: `${userName} left the room. ${nextAdmin.user_name} is now the admin.`,
          is_encrypted: false,
          is_system_message: true
        });
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
    requestToJoinRoom,
    approveJoinRequest,
    rejectJoinRequest,
    leaveRoom,
    sendMessage,
    sendPrivateMessage,
    availableRooms,
    fetchJoinRequests
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
};
